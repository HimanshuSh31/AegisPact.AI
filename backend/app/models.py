from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from sqlmodel import SQLModel, Field, Relationship, JSON, Column

# Status Enums
class JobStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class FindingStatus(str, Enum):
    COMPLIANT = "COMPLIANT"
    NON_COMPLIANT = "NON_COMPLIANT"
    WARNING = "WARNING"
    NOT_APPLICABLE = "NOT_APPLICABLE"

class Severity(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"

# Database Models
class Organization(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    users: List["User"] = Relationship(back_populates="organization")
    documents: List["Document"] = Relationship(back_populates="organization")

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, nullable=False)
    hashed_password: str = Field(nullable=False)
    full_name: str
    is_active: bool = Field(default=True)
    is_admin: bool = Field(default=False)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    organization: Organization = Relationship(back_populates="users")
    uploaded_documents: List["Document"] = Relationship(back_populates="uploader")
    audit_jobs: List["AuditJob"] = Relationship(back_populates="run_by")

class Document(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    file_path: str
    file_type: str
    size_bytes: int
    organization_id: int = Field(foreign_key="organization.id", index=True)
    uploader_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status: JobStatus = Field(default=JobStatus.PENDING)
    
    # Store parsed JSON layout maps and extracted tables
    # Structure: {"pages": [{"page_number": 1, "text": "...", "tables": [...]}]}
    parsing_result: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))

    # Relationships
    organization: Organization = Relationship(back_populates="documents")
    uploader: User = Relationship(back_populates="uploaded_documents")
    audit_jobs: List["AuditJob"] = Relationship(back_populates="document")

class ComplianceFramework(SQLModel, table=True):
    __tablename__ = "compliance_framework"  # pluralizing issue in SQLModel
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    description: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Store the set of audit criteria rules/controls
    # Structure: [{"rule_id": "GDPR-Art6", "title": "Lawfulness of processing", "description": "Verify that consent or legitimate interest is explicitly outlined."}]
    rules: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))

    # Relationships
    audit_jobs: List["AuditJob"] = Relationship(back_populates="framework")

class AuditJob(SQLModel, table=True):
    __tablename__ = "audit_job"
    id: Optional[int] = Field(default=None, primary_key=True)
    document_id: int = Field(foreign_key="document.id", index=True)
    framework_id: int = Field(foreign_key="compliance_framework.id", index=True)
    status: JobStatus = Field(default=JobStatus.PENDING)
    score: float = Field(default=0.0)  # Compliance Score (0-100%)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = Field(default=None)
    run_by_id: int = Field(foreign_key="user.id", index=True)
    
    # Ragas evaluation outcomes stored directly on job metadata
    eval_result: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))

    # Relationships
    document: Document = Relationship(back_populates="audit_jobs")
    framework: ComplianceFramework = Relationship(back_populates="audit_jobs")
    run_by: User = Relationship(back_populates="audit_jobs")
    findings: List["AuditFinding"] = Relationship(back_populates="audit_job")

class AuditFinding(SQLModel, table=True):
    __tablename__ = "audit_finding"
    id: Optional[int] = Field(default=None, primary_key=True)
    audit_job_id: int = Field(foreign_key="audit_job.id", index=True)
    rule_id: str = Field(index=True)  # References framework rule_id
    status: FindingStatus = Field(default=FindingStatus.COMPLIANT)
    clause_text: Optional[str] = Field(default=None)  # Extracted citation text from contract
    page_number: Optional[int] = Field(default=None)  # Citation page number
    explanation: str  # Legal auditor's reasoning
    severity: Severity = Field(default=Severity.INFO)

    # Relationships
    audit_job: AuditJob = Relationship(back_populates="findings")

    # Human-in-the-loop overrides
    is_overridden: bool = Field(default=False)
    overridden_status: Optional[FindingStatus] = Field(default=None)
    overridden_explanation: Optional[str] = Field(default=None)
    overridden_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    overridden_at: Optional[datetime] = Field(default=None)

# Pydantic schemas for request / response serialization
class UserCreate(SQLModel):
    email: str
    password: str
    full_name: str
    organization_name: str

class UserLogin(SQLModel):
    email: str
    password: str

class Token(SQLModel):
    access_token: str
    token_type: str

class TokenData(SQLModel):
    email: Optional[str] = None
    user_id: Optional[int] = None

class UserRead(SQLModel):
    id: int
    email: str
    full_name: str
    organization_id: int
    is_admin: bool

class OrganizationRead(SQLModel):
    id: int
    name: str

class DocumentRead(SQLModel):
    id: int
    name: str
    file_type: str
    size_bytes: int
    status: JobStatus
    created_at: datetime

class FrameworkCreate(SQLModel):
    name: str
    description: str
    rules: List[Dict[str, Any]]

class AuditJobCreate(SQLModel):
    document_id: int
    framework_id: int

class AuditJobBatchCreate(SQLModel):
    document_ids: List[int]
    framework_id: int

class AuditFindingOverride(SQLModel):
    status: FindingStatus
    explanation: str


class AuditSchedule(SQLModel, table=True):
    __tablename__ = "audit_schedule"
    id: Optional[int] = Field(default=None, primary_key=True)
    document_id: int = Field(foreign_key="document.id", index=True)
    framework_id: int = Field(foreign_key="compliance_framework.id", index=True)
    cron_expression: str = Field(default="0 0 * * *")  # cron scheduler string
    next_run_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AuditScheduleCreate(SQLModel):
    document_id: int
    framework_id: int
    cron_expression: str = "0 0 * * *"


class FrameworkUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    rules: Optional[List[Dict[str, Any]]] = None
