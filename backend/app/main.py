import os
import shutil
from datetime import datetime, timedelta
from typing import List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi.responses import RedirectResponse
from app.config import settings
from app.database import get_db, init_db
from app.models import (
    User, Organization, Document, ComplianceFramework, AuditJob, AuditFinding,
    UserCreate, UserRead, Token, FrameworkCreate, AuditJobCreate, JobStatus, DocumentRead
)
from app.auth import (
    get_password_hash, verify_password, create_access_token, get_current_user
)
from app.worker import process_document_task, run_audit_job_task

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup tables on database startup
    await init_db()
    yield

app = FastAPI(
    title="AegisPact.AI API",
    description="Enterprise legal audit platform API with layout parsing and hybrid RAG compliance verification.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", include_in_schema=False)
async def root_redirect():
    return RedirectResponse(url="/docs")

# ---------------------------------------------------------
# Auth Endpoints
# ---------------------------------------------------------

@app.post("/api/auth/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user already exists
    stmt = select(User).where(User.email == user_data.email)
    existing_user = (await db.execute(stmt)).scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create Organization first
    org_stmt = select(Organization).where(Organization.name == user_data.organization_name)
    org = (await db.execute(org_stmt)).scalar_one_or_none()
    if not org:
        org = Organization(name=user_data.organization_name)
        db.add(org)
        await db.flush() # Populate org.id

    # Create User
    hashed_pw = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        hashed_password=hashed_pw,
        full_name=user_data.full_name,
        organization_id=org.id,
        is_admin=True
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@app.post("/api/auth/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(User).where(User.email == form_data.username)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(
        data={"sub": user.email, "user_id": user.id}
    )
    return {"access_token": access_token, "token_type": "bearer"}

# ---------------------------------------------------------
# Document Ingestion Endpoints
# ---------------------------------------------------------

@app.post("/api/documents/upload", response_model=DocumentRead)
async def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Save the file locally
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in [".pdf", ".docx", ".txt"]:
        raise HTTPException(status_code=400, detail="Only PDF, Docx, and TXT files are supported.")

    file_name = file.filename
    unique_filename = f"{datetime.utcnow().timestamp()}_{file_name}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = os.path.getsize(file_path)

    # Insert document registry record
    document = Document(
        name=file_name,
        file_path=file_path,
        file_type=file_extension,
        size_bytes=file_size,
        organization_id=current_user.organization_id,
        uploader_id=current_user.id,
        status=JobStatus.PENDING
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    # Schedule asynchronous layout parser & vector ingestion task
    process_document_task.delay(document.id)

    return document

@app.get("/api/documents", response_model=List[DocumentRead])
async def list_documents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Document).where(Document.organization_id == current_user.organization_id)
    documents = (await db.execute(stmt)).scalars().all()
    return documents

@app.get("/api/documents/{id}")
async def get_document(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Document).where(Document.id == id, Document.organization_id == current_user.organization_id)
    document = (await db.execute(stmt)).scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document

# ---------------------------------------------------------
# Compliance Framework Endpoints
# ---------------------------------------------------------

@app.post("/api/frameworks", response_model=ComplianceFramework)
async def create_framework(
    framework_data: FrameworkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    framework = ComplianceFramework(
        name=framework_data.name,
        description=framework_data.description,
        rules=framework_data.rules
    )
    db.add(framework)
    await db.commit()
    await db.refresh(framework)
    return framework

@app.get("/api/frameworks", response_model=List[ComplianceFramework])
async def list_frameworks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ComplianceFramework)
    frameworks = (await db.execute(stmt)).scalars().all()
    return frameworks

# ---------------------------------------------------------
# Audit Job & Verification Endpoints
# ---------------------------------------------------------

@app.post("/api/audits/run", response_model=AuditJob)
async def run_audit(
    audit_data: AuditJobCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify document and framework exist
    doc_stmt = select(Document).where(Document.id == audit_data.document_id, Document.organization_id == current_user.organization_id)
    doc = (await db.execute(doc_stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    fw_stmt = select(ComplianceFramework).where(ComplianceFramework.id == audit_data.framework_id)
    fw = (await db.execute(fw_stmt)).scalar_one_or_none()
    if not fw:
        raise HTTPException(status_code=404, detail="Compliance Framework not found")

    # Create audit job
    job = AuditJob(
        document_id=doc.id,
        framework_id=fw.id,
        status=JobStatus.PENDING,
        run_by_id=current_user.id
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Trigger async auditing & RAG evaluation task
    run_audit_job_task.delay(job.id)

    return job

@app.get("/api/audits/{id}", response_model=AuditJob)
async def get_audit_status(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AuditJob).where(AuditJob.id == id)
    job = (await db.execute(stmt)).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Audit Job not found")
    
    # Verify authorization
    doc_stmt = select(Document).where(Document.id == job.document_id, Document.organization_id == current_user.organization_id)
    doc = (await db.execute(doc_stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=403, detail="Not authorized to access this audit job")
        
    return job

@app.get("/api/audits/{id}/findings", response_model=List[AuditFinding])
async def get_audit_findings(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AuditJob).where(AuditJob.id == id)
    job = (await db.execute(stmt)).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Audit Job not found")

    # Verify authorization
    doc_stmt = select(Document).where(Document.id == job.document_id, Document.organization_id == current_user.organization_id)
    doc = (await db.execute(doc_stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=403, detail="Not authorized to access this audit job")

    findings_stmt = select(AuditFinding).where(AuditFinding.audit_job_id == job.id)
    findings = (await db.execute(findings_stmt)).scalars().all()
    return findings
