import os
import shutil
from datetime import datetime
from typing import List
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import RedirectResponse
from fastapi import APIRouter
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

# Rate limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

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

# ---------------------------------------------------------
# Rate Limiter
# key_func: rate-limit by remote IP address
# default_limits: fallback global limit across all endpoints
# headers_enabled: emit X-RateLimit-* headers — slowapi
#   injects them via the `response` parameter on each handler
# ---------------------------------------------------------
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200/minute"],
    storage_uri="memory://",    # swap to "redis://localhost:6379" in production
    headers_enabled=True,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

# ---------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------
app = FastAPI(
    title="AegisPact.AI API",
    description=(
        "Enterprise legal audit platform API with layout parsing and hybrid RAG compliance verification.\n\n"
        "**API Versioning:** All endpoints are prefixed with `/api/v1/`.\n\n"
        "**Rate Limiting:** Per-IP limits enforced on all routes. "
        "Response headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` "
        "are included on every response."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Attach rate limiter state, middleware, and 429 exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
)

# Root → Swagger docs
@app.get("/", include_in_schema=False)
async def root_redirect():
    return RedirectResponse(url="/docs")

# ---------------------------------------------------------
# Versioned Router — /api/v1
# ---------------------------------------------------------
v1 = APIRouter(prefix="/api/v1")

# ---------------------------------------------------------
# Health Check — 60/minute
# ---------------------------------------------------------

@v1.get("/health", summary="Health Check", tags=["System"])
@limiter.limit("60/minute")
async def health_check(request: Request, response: Response):
    return {
        "status": "healthy",
        "version": "1.0.0",
        "service": "AegisPact.AI API",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

# ---------------------------------------------------------
# Auth — 10/minute (brute-force protection)
# ---------------------------------------------------------

@v1.post(
    "/auth/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    tags=["Auth"],
)
@limiter.limit("10/minute")
async def register(
    request: Request,
    response: Response,
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(User).where(User.email == user_data.email)
    existing_user = (await db.execute(stmt)).scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    org_stmt = select(Organization).where(Organization.name == user_data.organization_name)
    org = (await db.execute(org_stmt)).scalar_one_or_none()
    if not org:
        org = Organization(name=user_data.organization_name)
        db.add(org)
        await db.flush()

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


@v1.post(
    "/auth/token",
    response_model=Token,
    summary="Login and obtain a JWT access token",
    tags=["Auth"],
)
@limiter.limit("10/minute")
async def login_for_access_token(
    request: Request,
    response: Response,
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
    access_token = create_access_token(data={"sub": user.email, "user_id": user.id})
    return {"access_token": access_token, "token_type": "bearer"}

# ---------------------------------------------------------
# Documents — upload 30/min, reads 60/min
# ---------------------------------------------------------

@v1.post(
    "/documents/upload",
    response_model=DocumentRead,
    summary="Upload and ingest a legal contract document",
    tags=["Documents"],
)
@limiter.limit("30/minute")
async def upload_document(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in [".pdf", ".docx", ".txt"]:
        raise HTTPException(status_code=400, detail="Only PDF, Docx, and TXT files are supported.")

    unique_filename = f"{datetime.utcnow().timestamp()}_{file.filename}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = os.path.getsize(file_path)
    document = Document(
        name=file.filename,
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
    process_document_task.delay(document.id)
    return document


@v1.get(
    "/documents",
    response_model=List[DocumentRead],
    summary="List all documents for the current organization",
    tags=["Documents"],
)
@limiter.limit("60/minute")
async def list_documents(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Document).where(Document.organization_id == current_user.organization_id)
    documents = (await db.execute(stmt)).scalars().all()
    return documents


@v1.get(
    "/documents/{id}",
    summary="Get a single document by ID",
    tags=["Documents"],
)
@limiter.limit("60/minute")
async def get_document(
    request: Request,
    response: Response,
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
# Frameworks — 30/min write, 60/min read
# ---------------------------------------------------------

@v1.post(
    "/frameworks",
    response_model=ComplianceFramework,
    status_code=status.HTTP_201_CREATED,
    summary="Create a compliance policy framework",
    tags=["Frameworks"],
)
@limiter.limit("30/minute")
async def create_framework(
    request: Request,
    response: Response,
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


@v1.get(
    "/frameworks",
    response_model=List[ComplianceFramework],
    summary="List all compliance frameworks",
    tags=["Frameworks"],
)
@limiter.limit("60/minute")
async def list_frameworks(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ComplianceFramework)
    frameworks = (await db.execute(stmt)).scalars().all()
    return frameworks

# ---------------------------------------------------------
# Audits — trigger 20/min (compute-heavy), reads 60/min
# ---------------------------------------------------------

@v1.post(
    "/audits/run",
    response_model=AuditJob,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger an asynchronous RAG compliance audit job",
    tags=["Audits"],
)
@limiter.limit("20/minute")
async def run_audit(
    request: Request,
    response: Response,
    audit_data: AuditJobCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    doc_stmt = select(Document).where(
        Document.id == audit_data.document_id,
        Document.organization_id == current_user.organization_id
    )
    doc = (await db.execute(doc_stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    fw_stmt = select(ComplianceFramework).where(ComplianceFramework.id == audit_data.framework_id)
    fw = (await db.execute(fw_stmt)).scalar_one_or_none()
    if not fw:
        raise HTTPException(status_code=404, detail="Compliance Framework not found")

    job = AuditJob(
        document_id=doc.id,
        framework_id=fw.id,
        status=JobStatus.PENDING,
        run_by_id=current_user.id
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    run_audit_job_task.delay(job.id)
    return job


@v1.get(
    "/audits/{id}",
    response_model=AuditJob,
    summary="Get audit job status",
    tags=["Audits"],
)
@limiter.limit("60/minute")
async def get_audit_status(
    request: Request,
    response: Response,
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AuditJob).where(AuditJob.id == id)
    job = (await db.execute(stmt)).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Audit Job not found")

    doc_stmt = select(Document).where(
        Document.id == job.document_id,
        Document.organization_id == current_user.organization_id
    )
    doc = (await db.execute(doc_stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=403, detail="Not authorized to access this audit job")
    return job


@v1.get(
    "/audits/{id}/findings",
    response_model=List[AuditFinding],
    summary="Get compliance findings for a completed audit",
    tags=["Audits"],
)
@limiter.limit("60/minute")
async def get_audit_findings(
    request: Request,
    response: Response,
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AuditJob).where(AuditJob.id == id)
    job = (await db.execute(stmt)).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Audit Job not found")

    doc_stmt = select(Document).where(
        Document.id == job.document_id,
        Document.organization_id == current_user.organization_id
    )
    doc = (await db.execute(doc_stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=403, detail="Not authorized to access this audit job")

    findings_stmt = select(AuditFinding).where(AuditFinding.audit_job_id == job.id)
    findings = (await db.execute(findings_stmt)).scalars().all()
    return findings

# ---------------------------------------------------------
# Mount versioned router
# ---------------------------------------------------------
app.include_router(v1)

# ---------------------------------------------------------
# Legacy /api/... → /api/v1/... redirect aliases (301)
# Preserves backwards compatibility for existing integrations.
# ---------------------------------------------------------
LEGACY_REDIRECTS = [
    ("/api/auth/register",      "/api/v1/auth/register"),
    ("/api/auth/token",         "/api/v1/auth/token"),
    ("/api/documents",          "/api/v1/documents"),
    ("/api/documents/upload",   "/api/v1/documents/upload"),
    ("/api/frameworks",         "/api/v1/frameworks"),
    ("/api/audits/run",         "/api/v1/audits/run"),
]

for old_path, new_path in LEGACY_REDIRECTS:
    def make_redirect(target: str):
        async def _redirect():
            return RedirectResponse(url=target, status_code=301)
        return _redirect

    app.add_api_route(
        old_path,
        make_redirect(new_path),
        include_in_schema=False,
        methods=["GET", "POST"],
    )
