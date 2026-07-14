import os
import sys

# Force Celery eager & SQLite file configuration BEFORE imports
DB_FILE = "./test_advanced.db"
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
from jose import jwt

# Add backend app directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import init_db, async_session_maker
from app.models import User, Document, ComplianceFramework, Organization, AuditJob, AuditFinding, JobStatus, FindingStatus, Severity
from app.auth import get_password_hash


async def test_advanced_features():
    print("Initializing test database...")
    await init_db()
    
    # Create test data
    async with async_session_maker() as db:
        org = Organization(name="Advanced Org")
        db.add(org)
        await db.flush()
        
        user = User(
            email="auditor@aegispact.ai",
            hashed_password=get_password_hash("password123"),
            full_name="Lead Auditor",
            organization_id=org.id,
            is_admin=True
        )
        db.add(user)
        await db.flush()
        
        doc = Document(
            name="security_policy.pdf",
            file_path="mock.pdf",
            file_type=".pdf",
            size_bytes=4096,
            organization_id=org.id,
            uploader_id=user.id,
            status=JobStatus.COMPLETED,
            parsing_result={
                "metadata": {"title": "Security Policy"},
                "pages": [
                    {"page_number": 1, "text": "All user passwords must be hashed using bcrypt or argon2 before storage. We use strong encryption keys."},
                    {"page_number": 2, "text": "Customer logs and personal audit data must be retained for at least 7 years. All compliance records are stored securely."}
                ]
            }
        )
        db.add(doc)
        await db.flush()
        
        fw = ComplianceFramework(
            name="SOC2 Security",
            description="SOC2 security policy compliance requirements.",
            rules=[
                {"rule_id": "SEC-01", "title": "Password Hashing Controls", "description": "Ensure passwords are encrypted or hashed.", "severity": "HIGH"},
                {"rule_id": "SEC-02", "title": "Data Retention Limits", "description": "Ensure data is retained for 7 years.", "severity": "MEDIUM"}
            ]
        )
        db.add(fw)
        await db.flush()
        
        # Original Job
        job_a = AuditJob(
            document_id=doc.id,
            framework_id=fw.id,
            status=JobStatus.COMPLETED,
            score=50.0,
            run_by_id=user.id
        )
        db.add(job_a)
        await db.flush()
        
        # Enforce two findings for Job A
        finding_a1 = AuditFinding(
            audit_job_id=job_a.id,
            rule_id="SEC-01",
            status=FindingStatus.COMPLIANT,
            explanation="Found bcrypt references on page 1.",
            clause_text="All user passwords must be hashed using bcrypt.",
            page_number=1,
            severity=Severity.HIGH
        )
        finding_a2 = AuditFinding(
            audit_job_id=job_a.id,
            rule_id="SEC-02",
            status=FindingStatus.NON_COMPLIANT,
            explanation="Found no retention statement.",
            severity=Severity.MEDIUM
        )
        db.add(finding_a1)
        db.add(finding_a2)
        
        # Comparison Job B (improved)
        job_b = AuditJob(
            document_id=doc.id,
            framework_id=fw.id,
            status=JobStatus.COMPLETED,
            score=100.0,
            run_by_id=user.id
        )
        db.add(job_b)
        await db.flush()
        
        finding_b1 = AuditFinding(
            audit_job_id=job_b.id,
            rule_id="SEC-01",
            status=FindingStatus.COMPLIANT,
            explanation="Found bcrypt references on page 1.",
            clause_text="All user passwords must be hashed using bcrypt.",
            page_number=1,
            severity=Severity.HIGH
        )
        finding_b2 = AuditFinding(
            audit_job_id=job_b.id,
            rule_id="SEC-02",
            status=FindingStatus.COMPLIANT,
            explanation="Customer logs retained for 7 years.",
            clause_text="Customer logs and personal audit data must be retained for at least 7 years.",
            page_number=2,
            severity=Severity.MEDIUM
        )
        db.add(finding_b1)
        db.add(finding_b2)
        
        await db.commit()
        
        # Save IDs for routing tests
        doc_id = doc.id
        job_a_id = job_a.id
        job_b_id = job_b.id
        finding_id_to_override = finding_a2.id

    from app.main import app
    
    # ── Test Suite ──
    async with httpx.AsyncClient(app=app, base_url="http://testserver") as client:
        # 1. Login
        login_res = await client.post(
            "/api/v1/auth/token",
            data={"username": "auditor@aegispact.ai", "password": "password123"}
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        access_token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {access_token}"}
        
        # 2. Get Findings List
        findings_res = await client.get(f"/api/v1/audits/{job_a_id}/findings", headers=headers)
        assert findings_res.status_code == 200
        findings_data = findings_res.json()
        assert len(findings_data) == 2
        # Assert mapped attributes exist
        assert "rule_title" in findings_data[0]
        assert "verdict" in findings_data[0]
        assert findings_data[0]["rule_title"] == "Password Hashing Controls"
        
        # 3. Test Human Override
        override_res = await client.post(
            f"/api/v1/audits/{job_a_id}/findings/{finding_id_to_override}/override",
            json={"status": "COMPLIANT", "explanation": "Manually verified compliance via supplementary redlines."},
            headers=headers
        )
        assert override_res.status_code == 200
        override_data = override_res.json()
        assert override_data["is_overridden"] is True
        assert override_data["verdict"] == "COMPLIANT"
        assert override_data["new_score"] == 100.0  # Job A should now be 100% compliance score!
        
        # 4. Test PDF Scorecard Generation
        pdf_res = await client.get(f"/api/v1/audits/{job_a_id}/pdf", headers=headers)
        assert pdf_res.status_code == 200
        assert pdf_res.headers["content-type"] == "application/pdf"
        assert b"PDF" in pdf_res.content[:10]  # Verify PDF magic signature
        print(f"SUCCESS: PDF download scorecard returned valid binary buffer ({len(pdf_res.content)} bytes)")

        # 5. Test RAG Semantic Search
        search_res = await client.get(
            f"/api/v1/documents/{doc_id}/search",
            params={"query": "user password encryption controls", "top_k": 2},
            headers=headers
        )
        assert search_res.status_code == 200
        search_data = search_res.json()
        assert len(search_data) > 0
        assert "score" in search_data[0]
        assert "text" in search_data[0]
        assert "page_number" in search_data[0]
        print(f"SUCCESS: Semantic search explorer matched {len(search_data)} text citation nodes")
        
        # 6. Test Version Diff Comparison
        compare_res = await client.get(
            "/api/v1/audits/compare",
            params={"job_a": job_a_id, "job_b": job_b_id},
            headers=headers
        )
        print(f"Compare status: {compare_res.status_code}, content: {compare_res.text}")
        assert compare_res.status_code == 200
        compare_data = compare_res.json()
        assert "job_a" in compare_data
        assert "job_b" in compare_data
        assert "findings_comparison" in compare_data
        assert len(compare_data["findings_comparison"]) == 2
        print(f"SUCCESS: Comparison diff mapped {len(compare_data['findings_comparison'])} policy controls side-by-side")

    print("\nALL ADVANCED SUITE INTEGRATION TESTS COMPLETED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(test_advanced_features())
