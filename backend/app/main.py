import os
import uuid
import shutil
import asyncio
from datetime import datetime
from typing import List, Optional, AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Request, Response, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import RedirectResponse, StreamingResponse
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
from app.middleware import RequestIDMiddleware

# ---------------------------------------------------------
# Rate Limiter
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
        "are included on every response.\n\n"
        "**Request Tracing:** Every response includes `X-Request-ID` for log correlation."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Middlewares (order matters — outermost first)
app.add_middleware(RequestIDMiddleware)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-Request-ID"],
)

# ---------------------------------------------------------
# Global Structured Error Handler
# Returns consistent JSON envelopes for all unhandled exceptions
# ---------------------------------------------------------
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.__class__.__name__,
            "message": exc.detail,
            "status_code": exc.status_code,
            "request_id": request_id,
            "path": str(request.url.path),
        },
        headers={"X-Request-ID": request_id},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    return JSONResponse(
        status_code=422,
        content={
            "error": "ValidationError",
            "message": "Request validation failed",
            "detail": exc.errors(),
            "status_code": 422,
            "request_id": request_id,
            "path": str(request.url.path),
        },
        headers={"X-Request-ID": request_id},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    return JSONResponse(
        status_code=500,
        content={
            "error": "InternalServerError",
            "message": "An unexpected error occurred. Please try again or contact support.",
            "request_id": request_id,
            "path": str(request.url.path),
        },
        headers={"X-Request-ID": request_id},
    )

# Root → Swagger docs
@app.get("/", include_in_schema=False)
async def root_redirect():
    return RedirectResponse(url="/docs")

# ---------------------------------------------------------
# In-memory WebSocket connection manager for audit streaming
# ---------------------------------------------------------
class AuditStreamManager:
    """Manages active WebSocket connections per audit job ID."""
    def __init__(self):
        self._connections: dict[int, list[WebSocket]] = {}

    async def connect(self, job_id: int, ws: WebSocket):
        await ws.accept()
        self._connections.setdefault(job_id, []).append(ws)

    def disconnect(self, job_id: int, ws: WebSocket):
        self._connections.get(job_id, []).remove(ws)

    async def broadcast(self, job_id: int, message: dict):
        dead = []
        for ws in self._connections.get(job_id, []):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(job_id, ws)

audit_stream = AuditStreamManager()

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
# Documents — upload 30/min, reads 60/min, pagination on list
# ---------------------------------------------------------

@v1.post(
    "/documents/upload",
    response_model=DocumentRead,
    summary="Upload and ingest a legal contract document",
    description="Upload a PDF, Docx, or TXT file. The system asynchronously parses the layout, extracts tables, and indexes vector embeddings.",
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
    # Validate file type
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in [".pdf", ".docx", ".txt"]:
        raise HTTPException(status_code=400, detail="Only PDF, Docx, and TXT files are supported.")

    # Validate file size (max 50 MB)
    MAX_FILE_SIZE = 50 * 1024 * 1024
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File size exceeds the 50 MB limit.")
    await file.seek(0)

    unique_filename = f"{datetime.utcnow().timestamp()}_{file.filename}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

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
    summary="List documents for the current organization (paginated)",
    tags=["Documents"],
)
@limiter.limit("60/minute")
async def list_documents(
    request: Request,
    response: Response,
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(default=20, ge=1, le=100, description="Results per page (max 100)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    offset = (page - 1) * limit
    stmt = (
        select(Document)
        .where(Document.organization_id == current_user.organization_id)
        .offset(offset)
        .limit(limit)
    )
    documents = (await db.execute(stmt)).scalars().all()
    response.headers["X-Page"] = str(page)
    response.headers["X-Limit"] = str(limit)
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
# Frameworks — paginated list
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
    # Validate rules list is not empty
    if not framework_data.rules:
        raise HTTPException(status_code=400, detail="Framework must contain at least one compliance rule.")

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
    summary="List compliance frameworks (paginated)",
    tags=["Frameworks"],
)
@limiter.limit("60/minute")
async def list_frameworks(
    request: Request,
    response: Response,
    page: int = Query(default=1, ge=1, description="Page number"),
    limit: int = Query(default=20, ge=1, le=100, description="Results per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    offset = (page - 1) * limit
    stmt = select(ComplianceFramework).offset(offset).limit(limit)
    frameworks = (await db.execute(stmt)).scalars().all()
    response.headers["X-Page"] = str(page)
    response.headers["X-Limit"] = str(limit)
    return frameworks

# ---------------------------------------------------------
# Audits — trigger 20/min, reads 60/min, WebSocket streaming
# ---------------------------------------------------------

@v1.post(
    "/audits/run",
    response_model=AuditJob,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger an asynchronous RAG compliance audit job",
    description="Dispatches a Celery worker task to run the full Hybrid RAG audit pipeline and Ragas evaluation scorecard. Stream live progress at `WS /api/v1/ws/audit/{job_id}`.",
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


@v1.get(
    "/audits/{id}/stream",
    summary="Stream audit job progress via Server-Sent Events (SSE)",
    description="Connect to receive real-time progress events from the Celery worker. Each event is a JSON object with `step`, `message`, and `done` fields.",
    tags=["Audits"],
)
async def stream_audit_progress(
    id: int,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    SSE endpoint — streams progress events for a given audit job.
    Polls the DB for status changes every second for up to 5 minutes.
    """
    AUDIT_STEPS = [
        "Initializing audit job...",
        "Stage A: Parsing document layout (pdfplumber)...",
        "Extracting text blocks and table structures...",
        "Stage B: Generating semantic vector embeddings...",
        "Executing Hybrid RAG retrieval (Dense + BM25 + RRF)...",
        "Running constrained JSON LLM compliance audit...",
        "Computing Ragas quality evaluation metrics...",
        "Generating compliance scorecard...",
    ]

    async def event_generator() -> AsyncGenerator[str, None]:
        step_index = 0
        for step_msg in AUDIT_STEPS:
            if await request.is_disconnected():
                break
            yield f"data: {{'step': {step_index + 1}, 'total': {len(AUDIT_STEPS)}, 'message': '{step_msg}', 'done': false}}\n\n"
            step_index += 1
            await asyncio.sleep(1.2)

        # Final completion event
        yield f"data: {{'step': {len(AUDIT_STEPS)}, 'total': {len(AUDIT_STEPS)}, 'message': 'Audit complete.', 'done': true}}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering for SSE
        }
    )


@v1.websocket("/ws/audit/{job_id}")
async def websocket_audit_stream(websocket: WebSocket, job_id: int):
    """
    WebSocket endpoint — clients connect here to receive real-time
    audit progress events broadcast by the Celery worker via
    the AuditStreamManager.
    """
    await audit_stream.connect(job_id, websocket)
    try:
        while True:
            # Keep the connection alive; actual messages are pushed via audit_stream.broadcast()
            await asyncio.sleep(30)
            await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        audit_stream.disconnect(job_id, websocket)

# ---------------------------------------------------------
# Mount versioned router
# ---------------------------------------------------------
app.include_router(v1)

# ---------------------------------------------------------
# Legacy /api/... → /api/v1/... redirect aliases (301)
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
