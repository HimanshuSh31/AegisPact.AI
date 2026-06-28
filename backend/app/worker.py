import os
import asyncio
import nest_asyncio
from datetime import datetime
import logging
import socket
from urllib.parse import urlparse
from celery import Celery

nest_asyncio.apply()
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_maker
from app.models import Document, AuditJob, ComplianceFramework, AuditFinding, JobStatus, FindingStatus, Severity
from app.parser import ContractParser
from app.rag_engine import SemanticChunker, DenseRetriever, HybridSearchEngine, LLMAuditor
from app.evaluator import AuditEvaluator

logger = logging.getLogger("contract_auditor.worker")

# Check if Redis is running
def check_redis_online(redis_url: str) -> bool:
    try:
        parsed = urlparse(redis_url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 6379
        s = socket.create_connection((host, port), timeout=1.0)
        s.close()
        return True
    except Exception:
        return False

# Initialize Celery app
celery_app = Celery(
    "tasks",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# Fallback to Eager Mode (synchronous) if Redis is offline
if not check_redis_online(settings.REDIS_URL):
    logger.warning("Redis is offline. Enabling Celery Eager Mode for inline task execution.")
    celery_app.conf.update(
        task_always_eager=True,
        task_eager_propagates=True
    )

# Helper to run async code synchronously inside Celery tasks
def run_async(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)

# ---------------------------------------------------------
# Celery Tasks
# ---------------------------------------------------------

@celery_app.task(name="app.worker.process_document_task")
def process_document_task(document_id: int):
    """
    Parses a PDF document asynchronously, extracts layout, and indexes chunks.
    """
    return run_async(async_process_document(document_id))

@celery_app.task(name="app.worker.run_audit_job_task")
def run_audit_job_task(audit_job_id: int):
    """
    Executes a compliance framework audit on a document.
    """
    return run_async(async_run_audit_job(audit_job_id))

# ---------------------------------------------------------
# Async Implementations
# ---------------------------------------------------------

async def async_process_document(document_id: int):
    logger.info(f"Worker task started: Parsing document {document_id}")
    
    async with async_session_maker() as session:
        result = await session.execute(select(Document).where(Document.id == document_id))
        document = result.scalar_one_or_none()
        if not document:
            logger.error(f"Document {document_id} not found in database.")
            return False

        try:
            document.status = JobStatus.PROCESSING
            await session.commit()

            # Stage A: Layout Parsing
            parser = ContractParser()
            manifest = parser.parse_document(document.file_path)
            
            # Save parsing result (JSON manifest)
            document.parsing_result = manifest
            await session.commit()

            # Stage B: Semantic Chunking & Ingestion
            chunker = SemanticChunker(target_chunk_size=400, overlap=50)
            chunks = chunker.chunk_document(manifest)
            
            # Store in Vector DB
            dense_retriever = DenseRetriever(qdrant_url=settings.QDRANT_URL, ollama_base_url=settings.OLLAMA_BASE_URL)
            await dense_retriever.index_chunks(document.id, chunks)

            document.status = JobStatus.COMPLETED
            await session.commit()
            logger.info(f"Worker task completed: Document {document_id} fully indexed.")
            return True

        except Exception as e:
            logger.error(f"Worker parser failure for document {document_id}: {str(e)}", exc_info=True)
            document.status = JobStatus.FAILED
            await session.commit()
            return False


async def async_run_audit_job(audit_job_id: int):
    logger.info(f"Worker task started: Running audit job {audit_job_id}")
    
    async with async_session_maker() as session:
        # Load AuditJob with framework and document relations
        result = await session.execute(select(AuditJob).where(AuditJob.id == audit_job_id))
        job = result.scalar_one_or_none()
        if not job:
            logger.error(f"AuditJob {audit_job_id} not found.")
            return False

        try:
            job.status = JobStatus.PROCESSING
            await session.commit()

            # Fetch associated document and framework
            doc_result = await session.execute(select(Document).where(Document.id == job.document_id))
            document = doc_result.scalar_one_or_none()
            
            fw_result = await session.execute(select(ComplianceFramework).where(ComplianceFramework.id == job.framework_id))
            framework = fw_result.scalar_one_or_none()

            if not document or not framework:
                raise ValueError("Associated document or compliance framework missing.")

            if not document.parsing_result:
                raise ValueError("Document has not been processed/parsed yet.")

            # Set up retrievers & LLM Auditor
            chunker = SemanticChunker(target_chunk_size=400, overlap=50)
            chunks = chunker.chunk_document(document.parsing_result)

            dense_retriever = DenseRetriever(qdrant_url=settings.QDRANT_URL, ollama_base_url=settings.OLLAMA_BASE_URL)
            # Make sure retriever has cached copy of mock chunks if not using Qdrant service
            await dense_retriever.index_chunks(document.id, chunks)

            hybrid_search = HybridSearchEngine(dense_retriever)
            auditor = LLMAuditor(ollama_base_url=settings.OLLAMA_BASE_URL, model_name=settings.OLLAMA_MODEL)

            # Store details for evaluation
            questions = []
            retrieved_contexts = []
            answers = []

            findings = []
            rules = framework.rules
            total_rules = len(rules)
            compliant_count = 0

            for rule in rules:
                rule_id = rule.get("rule_id")
                query = f"{rule.get('title')}: {rule.get('description')}"
                
                # Hybrid Search dense + sparse (BM25)
                context = await hybrid_search.retrieve(document.id, chunks, query, top_k=3)
                
                # Run LLM Audit with constrained JSON
                audit_output = await auditor.audit_rule(rule, context)
                
                # Register compliance count
                if audit_output.status == FindingStatus.COMPLIANT:
                    compliant_count += 1
                
                # Create finding
                finding = AuditFinding(
                    audit_job_id=job.id,
                    rule_id=rule_id,
                    status=FindingStatus(audit_output.status),
                    clause_text=audit_output.clause_text,
                    page_number=audit_output.page_number,
                    explanation=audit_output.explanation,
                    severity=Severity(audit_output.severity)
                )
                session.add(finding)
                findings.append(finding)

                # Collect for evaluator
                questions.append(rule.get("description"))
                retrieved_contexts.append([c["text"] for c in context])
                answers.append(audit_output.explanation)

            # Compute compliance score percentage
            compliance_score = (compliant_count / total_rules * 100.0) if total_rules > 0 else 100.0
            job.score = round(compliance_score, 2)

            # Stage C: Evaluation (Ragas + Structured Logs)
            evaluator = AuditEvaluator(settings.OLLAMA_BASE_URL)
            eval_scores = await evaluator.evaluate_audit(
                audit_job_id=job.id,
                questions=questions,
                retrieved_contexts=retrieved_contexts,
                answers=answers
            )
            job.eval_result = eval_scores

            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.utcnow()
            await session.commit()
            
            logger.info(f"Worker task completed: Audit job {audit_job_id} scored {job.score}%.")
            return True

        except Exception as e:
            logger.error(f"Worker audit job failure for job {audit_job_id}: {str(e)}", exc_info=True)
            job.status = JobStatus.FAILED
            job.completed_at = datetime.utcnow()
            await session.commit()
            return False
