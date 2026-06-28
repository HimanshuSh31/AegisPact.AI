import os
import sys
import asyncio
import logging
from unittest.mock import MagicMock, patch

# Add backend app directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
# Set SQLite in-memory database URL before importing database module
settings.DATABASE_URL = "sqlite+aiosqlite:///:memory:"

from app.database import init_db, async_session_maker
from app.models import (
    UserCreate, FrameworkCreate, AuditJobCreate, JobStatus,
    FindingStatus, User, Organization, Document, ComplianceFramework, AuditJob, AuditFinding
)
from app.main import register, create_framework
from app.worker import async_process_document, async_run_audit_job
from sqlmodel import select

# Set up test logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("contract_auditor.integration_test")

# Mock pdfplumber for layout parsing testing
class MockWord:
    def __init__(self, text, x0, top, x1, bottom):
        self.d = {"text": text, "x0": x0, "top": top, "x1": x1, "bottom": bottom}
    def __getitem__(self, key):
        return self.d[key]

class MockTable:
    def __init__(self, data, bbox):
        self.data = data
        self.bbox = bbox
    def extract(self):
        return self.data

class MockPage:
    def __init__(self, text, tables_data, words):
        self.width = 612.0
        self.height = 792.0
        self.text = text
        self.tables_data = tables_data
        self.words = words

    def extract_text(self):
        return self.text

    def find_tables(self):
        return [MockTable(t["data"], t["bbox"]) for t in self.tables_data]

    def extract_words(self):
        return self.words

class MockPDF:
    def __init__(self, pages):
        self.pages = pages
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

def get_mock_pdfplumber_open(pages):
    return lambda file_path: MockPDF(pages)


async def run_integration_test():
    logger.info("Initializing in-memory database configuration for integration test...")
    
    # Force SQLite in-memory database for local test run
    settings.DATABASE_URL = "sqlite+aiosqlite:///:memory:"
    
    # Initialize DB schemas
    await init_db()

    # Define mock contract page contents
    mock_pages = [
        MockPage(
            text="ACME CONTRACT AGREEMENT\nEffective Date: January 1, 2026.\nThis agreement governs user data.\nSection 1: Data Processing & Rights.\nWe collect user names and emails. We do not obtain user consent explicitly before tracking location data.",
            tables_data=[],
            words=[
                MockWord("ACME", 100, 50, 150, 65), MockWord("CONTRACT", 160, 50, 240, 65),
                MockWord("Section", 100, 100, 150, 115), MockWord("1:", 160, 100, 180, 115),
                MockWord("Data", 190, 100, 220, 115), MockWord("Processing", 230, 100, 300, 115)
            ]
        ),
        MockPage(
            text="Section 2: Data Transfer and Safety.\nHere is the data distribution log table:",
            tables_data=[
                {
                    "bbox": [50, 150, 300, 250],
                    "data": [
                        ["Recipient", "Purpose", "Data Category"],
                        ["Analytics Inc", "Telemetry", "Usage Statistics"],
                        ["Marketing LLC", "Targeting", "Cookies & Identity"]
                    ]
                }
            ],
            words=[
                MockWord("Section", 100, 50, 150, 65), MockWord("2:", 160, 50, 180, 65),
                MockWord("Data", 100, 120, 130, 135), MockWord("Transfer", 140, 120, 190, 135)
            ]
        )
    ]

    # Patch pdfplumber to run without touching disk PDFs
    with patch("pdfplumber.open", new=get_mock_pdfplumber_open(mock_pages)):
        
        async with async_session_maker() as db:
            # 1. Simulate Organization & User Registration
            logger.info("Step 1: Simulating user registration...")
            user_in = UserCreate(
                email="auditor@acme.corp",
                password="SecurePassword123!",
                full_name="Jane Doe",
                organization_name="Acme Corp"
            )
            user = await register(user_in, db)
            logger.info(f"Registered user: {user.full_name} under Org ID {user.organization_id}")

            # 2. Simulate Compliance Framework Setup
            logger.info("Step 2: Simulating Compliance Framework creation...")
            framework_in = FrameworkCreate(
                name="GDPR Compliance Framework",
                description="General Data Protection Regulation Core Contract Audit Rules",
                rules=[
                    {
                        "rule_id": "GDPR-Art6",
                        "title": "Lawfulness of Processing",
                        "description": "Requires explicit consent or legitimate interest for processing tracking/personal data."
                    },
                    {
                        "rule_id": "GDPR-Art13",
                        "title": "Information Provisioning",
                        "description": "Requires contract to detail list of external recipients and purposes of data transfer."
                    }
                ]
            )
            framework = await create_framework(framework_data=framework_in, db=db)
            logger.info(f"Created Compliance Framework: {framework.name} with {len(framework.rules)} rules.")

            # 3. Simulate File Upload & Ingestion Registry
            logger.info("Step 3: Creating Document registry...")
            doc = Document(
                name="acme_privacy_policy.pdf",
                file_path="mock_path.pdf",
                file_type=".pdf",
                size_bytes=2048,
                organization_id=user.organization_id,
                uploader_id=user.id,
                status=JobStatus.PENDING
            )
            db.add(doc)
            await db.commit()
            await db.refresh(doc)
            logger.info(f"Created Document record: ID {doc.id}, Status: {doc.status}")

            # 4. Run Stage A Parser Task (Inline Execution)
            logger.info("Step 4: Running Layout Parser task...")
            # We mock the physical file check since path is 'mock_path.pdf'
            with patch("os.path.exists", return_value=True):
                success = await async_process_document(doc.id)
                assert success is True, "Parsing task failed"
            
            # Fetch parsed document manifest
            await db.refresh(doc)
            logger.info(f"Layout Parsing complete. Document Status: {doc.status}")
            assert doc.status == JobStatus.COMPLETED
            assert doc.parsing_result is not None
            logger.info("Extracted layout pages structure:")
            for p in doc.parsing_result["pages"]:
                logger.info(f" Page {p['page_number']}: Character Length: {len(p['text'])}, Tables Found: {len(p['tables'])}")

            # 5. Run Stage B Audit & Hybrid RAG Task (Inline Execution)
            logger.info("Step 5: Scheduling and running compliance audit job...")
            job = AuditJob(
                document_id=doc.id,
                framework_id=framework.id,
                status=JobStatus.PENDING,
                run_by_id=user.id
            )
            db.add(job)
            await db.commit()
            await db.refresh(job)
            logger.info(f"Created AuditJob ID: {job.id}")

            # Mock LLM Auditor responses for deterministic test outcome
            # GDPR-Art6: Non-compliant (does not obtain consent)
            # GDPR-Art13: Compliant (contains table listing recipients)
            async def mock_audit_rule(rule, context_chunks):
                from app.rag_engine import ComplianceAuditOutput
                rule_id = rule.get("rule_id")
                if rule_id == "GDPR-Art6":
                    return ComplianceAuditOutput(
                        status=FindingStatus.NON_COMPLIANT.value,
                        clause_text="We do not obtain user consent explicitly before tracking location data.",
                        page_number=1,
                        explanation="The contract explicitly states that location tracking does not obtain consent, violating GDPR Art. 6 lawfulness of processing requirements.",
                        severity="HIGH"
                    )
                else:
                    return ComplianceAuditOutput(
                        status=FindingStatus.COMPLIANT.value,
                        clause_text="Analytics Inc | Telemetry | Usage Statistics",
                        page_number=2,
                        explanation="The contract details third party data recipients (Analytics Inc, Marketing LLC) and their purposes in a table on Page 2.",
                        severity="INFO"
                    )

            with patch("app.worker.LLMAuditor.audit_rule", side_effect=mock_audit_rule):
                job_success = await async_run_audit_job(job.id)
                assert job_success is True, "Auditing task failed"

            # 6. Verify Results & Scores
            logger.info("Step 6: Verifying audit results, scoring, and MLOps metrics...")
            await db.refresh(job)
            logger.info(f"Audit Job complete. Status: {job.status}, Compliance Score: {job.score}%")
            assert job.status == JobStatus.COMPLETED
            assert job.score == 50.0  # 1 compliant out of 2 rules = 50%
            
            # Fetch findings
            from sqlalchemy.orm import selectinload
            findings_stmt = select(AuditFinding).where(AuditFinding.audit_job_id == job.id)
            findings = (await db.execute(findings_stmt)).scalars().all()
            logger.info("Generated Audit Findings:")
            for f in findings:
                logger.info(f" [{f.status.value}] Rule: {f.rule_id} (Page {f.page_number})")
                logger.info(f"   Citation: '{f.clause_text}'")
                logger.info(f"   Reasoning: {f.explanation}")
                
            # Verify Ragas scores
            logger.info("MLOps Quality Metrics (Ragas scores):")
            logger.info(f" Faithfulness: {job.eval_result.get('faithfulness')}")
            logger.info(f" Answer Relevance: {job.eval_result.get('answer_relevance')}")
            logger.info(f" Context Recall: {job.eval_result.get('context_recall')}")
            
            assert job.eval_result.get("faithfulness") > 0.0
            assert job.eval_result.get("answer_relevance") > 0.0
            assert job.eval_result.get("context_recall") > 0.0

            logger.info("INTEGRATION TEST COMPLETED SUCCESSFULLY WITH 100% ASSERTION PASS RATE.")

if __name__ == "__main__":
    asyncio.run(run_integration_test())
