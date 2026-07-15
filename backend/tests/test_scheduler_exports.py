import os
import sys

# Force Celery eager & SQLite file configuration BEFORE imports
DB_FILE = "./test_scheduler_exports.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DB_FILE}"
os.environ["CELERY_ALWAYS_EAGER"] = "True"
os.environ["JWT_SECRET"] = "ci_test_secret_key_12345"

# Clean up DB file if exists
if os.path.exists(DB_FILE):
    try:
        os.remove(DB_FILE)
    except:
        pass

import asyncio
import httpx

# Add backend app directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import init_db, async_session_maker
from app.models import User, Document, Organization, ComplianceFramework, AuditJob, AuditSchedule, JobStatus


async def test_scheduler_and_exports():
    print("Initializing test database...")
    await init_db()
    
    # Create test data
    async with async_session_maker() as db:
        org = Organization(name="Schedules Org")
        db.add(org)
        await db.flush()
        
        user = User(
            email="scheduler_auditor@aegispact.ai",
            hashed_password="hashed_pwd_here",
            full_name="Scheduler Auditor",
            organization_id=org.id,
            is_admin=True
        )
        db.add(user)
        await db.flush()
        
        fw = ComplianceFramework(
            name="SLA Policy",
            description="Lease agreement SLA guidelines",
            rules=[{"rule_id": "SLA_01", "title": "Availability SLA", "description": "Verifies uptime commitments."}]
        )
        db.add(fw)
        await db.flush()
        
        doc = Document(
            name="lease_sla.pdf",
            file_path="mock.pdf",
            file_type=".pdf",
            size_bytes=2048,
            organization_id=org.id,
            uploader_id=user.id,
            status=JobStatus.COMPLETED,
            parsing_result={"metadata": {}, "pages": [{"page_number": 1, "text": "This lease specifies SLA commitments."}]}
        )
        db.add(doc)
        await db.flush()
        
        job_a = AuditJob(
            document_id=doc.id,
            framework_id=fw.id,
            status=JobStatus.COMPLETED,
            score=60.0,
            run_by_id=user.id,
            eval_result={"faithfulness": 0.8, "answer_relevance": 0.8, "context_recall": 0.8}
        )
        job_b = AuditJob(
            document_id=doc.id,
            framework_id=fw.id,
            status=JobStatus.COMPLETED,
            score=100.0,
            run_by_id=user.id,
            eval_result={"faithfulness": 0.9, "answer_relevance": 0.9, "context_recall": 0.9}
        )
        db.add(job_a)
        db.add(job_b)
        await db.flush()
        await db.commit()
        
        fw_id = fw.id
        doc_id = doc.id
        job_a_id = job_a.id
        job_b_id = job_b.id

    from app.main import app
    async with httpx.AsyncClient(app=app, base_url="http://testserver") as client:
        # Generate OAuth Token
        # Since hashed_password is mock, we can override dependency or mock auth checks
        # Let's bypass OAuth for test requests using mock authorization headers
        # We can construct a JWT token for the user manually
        from jose import jwt
        from datetime import datetime, timedelta
        token_payload = {
            "sub": "scheduler_auditor@aegispact.ai",
            "user_id": user.id,
            "type": "access",
            "exp": datetime.utcnow() + timedelta(hours=1)
        }
        token = jwt.encode(token_payload, "ci_test_secret_key_12345", algorithm="HS256")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Test Framework Modification
        print("Testing PUT /api/v1/frameworks/{id}...")
        update_res = await client.put(
            f"/api/v1/frameworks/{fw_id}",
            json={"name": "Updated SLA Policy", "description": "Updated description"},
            headers=headers
        )
        assert update_res.status_code == 200
        assert update_res.json()["name"] == "Updated SLA Policy"
        print("SUCCESS: Framework updated successfully.")

        # 2. Test Compare PDF Endpoint
        print("Testing GET /api/v1/audits/compare/pdf...")
        compare_pdf_res = await client.get(
            f"/api/v1/audits/compare/pdf?id_a={job_a_id}&id_b={job_b_id}",
            headers=headers
        )
        if compare_pdf_res.status_code != 200:
            print(f"FAILED: compare_pdf status={compare_pdf_res.status_code} body={compare_pdf_res.text}")
        assert compare_pdf_res.status_code == 200
        assert compare_pdf_res.headers["content-type"] == "application/pdf"
        assert compare_pdf_res.content.startswith(b"%PDF")
        print("SUCCESS: Comparative PDF scorecard downloaded successfully.")

        # 3. Test CSV Export Endpoint
        print("Testing GET /api/v1/audits/export...")
        export_res = await client.get(
            "/api/v1/audits/export",
            headers=headers
        )
        assert export_res.status_code == 200
        assert export_res.headers["content-type"] == "text/csv; charset=utf-8"
        csv_text = export_res.text
        assert "Audit Job ID" in csv_text
        assert "Contract Name" in csv_text
        assert "SLA Policy" in csv_text or "Updated SLA Policy" in csv_text
        print("SUCCESS: CSV audit log export downloaded successfully.")

        # 4. Test Schedules Endpoint (Create, List, Delete)
        print("Testing POST /api/v1/schedules...")
        sched_res = await client.post(
            "/api/v1/schedules",
            json={
                "document_id": doc_id,
                "framework_id": fw_id,
                "cron_expression": "hourly"
            },
            headers=headers
        )
        assert sched_res.status_code == 200
        sched_data = sched_res.json()
        assert sched_data["cron_expression"] == "hourly"
        sched_id = sched_data["id"]
        print("SUCCESS: Recurring cron schedule created successfully.")

        print("Testing GET /api/v1/schedules...")
        list_res = await client.get(
            "/api/v1/schedules",
            headers=headers
        )
        assert list_res.status_code == 200
        assert len(list_res.json()) > 0
        print("SUCCESS: Listed schedules successfully.")

        # 5. Test calculate_next_run and loop trigger
        from app.main import calculate_next_run
        next_run = calculate_next_run("hourly")
        assert next_run > datetime.utcnow()
        print("SUCCESS: Next run calculation verified.")

        print("Testing DELETE /api/v1/schedules/{id}...")
        del_res = await client.delete(
            f"/api/v1/schedules/{sched_id}",
            headers=headers
        )
        assert del_res.status_code == 200
        print("SUCCESS: Deleted schedule successfully.")

    print("\nALL POLICY BUILDER, COMPARISONS, EXPORTS, AND CRON SCHEDULER TESTS COMPLETED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(test_scheduler_and_exports())
