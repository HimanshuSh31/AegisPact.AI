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
            
            # Send notification
            await notify_audit_completion(job.id, session)
            
            logger.info(f"Worker task completed: Audit job {audit_job_id} scored {job.score}%.")
            return True

        except Exception as e:
            logger.error(f"Worker audit job failure for job {audit_job_id}: {str(e)}", exc_info=True)
            try:
                job.status = JobStatus.FAILED
                job.completed_at = datetime.utcnow()
                await session.commit()
                # Send failure notification
                await notify_audit_completion(job.id, session, failed=True, error_msg=str(e))
            except Exception as db_exc:
                logger.error(f"Failed to record audit job failure in DB: {str(db_exc)}")
            return False


import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import httpx
from app.models import User, ComplianceFramework

async def notify_audit_completion(job_id: int, session: AsyncSession, failed: bool = False, error_msg: str = ""):
    """Send Slack Webhook alerts and SMTP HTML emails to user upon Celery job completion."""
    try:
        stmt = select(AuditJob).where(AuditJob.id == job_id)
        job = (await session.execute(stmt)).scalar_one_or_none()
        if not job:
            return
            
        doc_stmt = select(Document).where(Document.id == job.document_id)
        doc = (await session.execute(doc_stmt)).scalar_one_or_none()
        
        fw_stmt = select(ComplianceFramework).where(ComplianceFramework.id == job.framework_id)
        fw = (await session.execute(fw_stmt)).scalar_one_or_none()
        
        user_stmt = select(User).where(User.id == job.run_by_id)
        user = (await session.execute(user_stmt)).scalar_one_or_none()
        
        doc_name = doc.name if doc else f"Document #{job.document_id}"
        fw_name = fw.name if fw else f"Framework #{job.framework_id}"
        user_email = user.email if user else None
        user_name = user.full_name if user else "Auditor"
        
        status_text = "FAILED" if failed else "COMPLETED"
        score_text = f"{job.score}%" if (job.score is not None and not failed) else "N/A"
        
        # 1. Slack Webhook Dispatch
        if settings.SLACK_WEBHOOK_URL:
            color = "#ef4444" if failed else ("#10b981" if job.score >= 80 else "#f59e0b")
            slack_payload = {
                "attachments": [
                    {
                        "color": color,
                        "title": f"Compliance Audit {status_text}: {doc_name}",
                        "text": f"Audit Job #{job.id} has completed.",
                        "fields": [
                            {"title": "Document", "value": doc_name, "short": True},
                            {"title": "Framework", "value": fw_name, "short": True},
                            {"title": "Compliance Score", "value": score_text, "short": True},
                            {"title": "Audited By", "value": user_name, "short": True}
                        ]
                    }
                ]
            }
            if failed:
                slack_payload["attachments"][0]["fields"].append(
                    {"title": "Error Message", "value": error_msg or "Unknown error", "short": False}
                )
            elif job.eval_result:
                f_score = job.eval_result.get("faithfulness", 0.0)
                r_score = job.eval_result.get("answer_relevance", 0.0)
                slack_payload["attachments"][0]["fields"].append(
                    {"title": "Ragas Quality Metrics", "value": f"Faithfulness: {f_score:.2f} | Relevance: {r_score:.2f}", "short": False}
                )
            
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    await client.post(settings.SLACK_WEBHOOK_URL, json=slack_payload)
                    logger.info(f"Slack webhook dispatched successfully for job {job_id}")
            except Exception as se:
                logger.warning(f"Failed to send Slack webhook for job {job_id}: {str(se)}")

        # 2. SMTP Email Dispatch
        if settings.SMTP_HOST and user_email:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"[AegisPact.AI] Compliance Audit {status_text} - {doc_name}"
            msg["From"] = settings.SMTP_FROM
            msg["To"] = user_email
            
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; background-color: #f8fafc; color: #1e293b; padding: 20px;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 30px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                    <div style="border-bottom: 2px solid #6366f1; padding-bottom: 15px; margin-bottom: 20px;">
                        <h2 style="color: #6366f1; margin: 0;">🛡️ AegisPact.AI Scorecard</h2>
                        <span style="font-size: 12px; color: #64748b;">Automated Compliance Audit Report</span>
                    </div>
                    <p>Dear {user_name},</p>
                    <p>Your contract compliance audit job has finished with status <strong>{status_text}</strong>.</p>
                    
                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                        <tr style="background: #f1f5f9;">
                            <td style="padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;">Audit Job ID</td>
                            <td style="padding: 10px; border: 1px solid #cbd5e1;">#{job.id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;">Document Name</td>
                            <td style="padding: 10px; border: 1px solid #cbd5e1;">{doc_name}</td>
                        </tr>
                        <tr style="background: #f1f5f9;">
                            <td style="padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;">Policy Framework</td>
                            <td style="padding: 10px; border: 1px solid #cbd5e1;">{fw_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold; border: 1px solid #cbd5e1; color: #6366f1; font-size: 16px;">Compliance Score</td>
                            <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold; font-size: 16px; color: #6366f1;">{score_text}</td>
                        </tr>
                    </table>
            """
            
            if failed:
                html_content += f"""
                    <div style="background: #fff1f2; border: 1px solid #ffe4e6; border-radius: 6px; padding: 15px; margin-top: 15px; color: #e11d48;">
                        <strong>Audit Failure Error:</strong><br/>
                        <code style="font-size: 13px;">{error_msg}</code>
                    </div>
                """
            elif job.eval_result:
                f_score = job.eval_result.get("faithfulness", 0.0)
                r_score = job.eval_result.get("answer_relevance", 0.0)
                c_recall = job.eval_result.get("context_recall", 0.0)
                html_content += f"""
                    <h3 style="color: #334155; border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 20px;">📊 MLOps Ragas Quality Metrics</h3>
                    <ul>
                        <li><strong>Faithfulness:</strong> {f_score * 100:.1f}%</li>
                        <li><strong>Answer Relevance:</strong> {r_score * 100:.1f}%</li>
                        <li><strong>Context Recall:</strong> {c_recall * 100:.1f}%</li>
                    </ul>
                """
            
            html_content += """
                    <p style="margin-top: 30px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 15px;">
                        This is an automated notification from AegisPact.AI. Please do not reply.
                    </p>
                </div>
            </body>
            </html>
            """
            
            msg.attach(MIMEText(html_content, "html"))
            
            def send_mail_sync():
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10.0) as server:
                    if settings.SMTP_USER and settings.SMTP_PASSWORD:
                        server.starttls()
                        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                    server.sendmail(settings.SMTP_FROM, user_email, msg.as_string())
            
            try:
                await asyncio.to_thread(send_mail_sync)
                logger.info(f"HTML email notification sent successfully to {user_email} for job {job_id}")
            except Exception as ee:
                logger.warning(f"Failed to send email notification to {user_email} for job {job_id}: {str(ee)}")

    except Exception as exc:
        logger.error(f"Error executing notify_audit_completion for job {job_id}: {str(exc)}")

