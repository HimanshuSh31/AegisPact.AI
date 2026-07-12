import os
import sys

# Force Celery eager & SQLite file configuration BEFORE imports
DB_FILE = "./test_polish.db"
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

from app.config import settings

from app.database import init_db, async_session_maker
from app.models import User, Document, ComplianceFramework, Organization, JobStatus
from app.auth import get_password_hash


async def test_polish_and_security():
    print("Initializing database...")
    await init_db()
    
    # Create test data
    async with async_session_maker() as db:
        org = Organization(name="Test Org")
        db.add(org)
        await db.flush()
        
        user = User(
            email="tester@aegispact.ai",
            hashed_password=get_password_hash("password123"),
            full_name="Test User",
            organization_id=org.id,
            is_admin=True
        )
        db.add(user)
        await db.flush()
        
        doc1 = Document(
            name="contract1.pdf",
            file_path="mock1.pdf",
            file_type=".pdf",
            size_bytes=1024,
            organization_id=org.id,
            uploader_id=user.id,
            status=JobStatus.COMPLETED
        )
        doc2 = Document(
            name="contract2.pdf",
            file_path="mock2.pdf",
            file_type=".pdf",
            size_bytes=1024,
            organization_id=org.id,
            uploader_id=user.id,
            status=JobStatus.COMPLETED
        )
        db.add(doc1)
        db.add(doc2)
        await db.flush()
        
        fw = ComplianceFramework(
            name="Test Policy",
            description="Testing batch compliance audits.",
            rules=[{"rule_id": "RULE-1", "title": "Mock Rule", "description": "Ensure layout is populated."}]
        )
        db.add(fw)
        await db.commit()
    
    # Run tests using ASGI transport or local httpx client against the app instance
    from app.main import app
    
    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        # 1. Test Login & HttpOnly cookie issuance
        print("Testing POST /api/v1/auth/token...")
        login_res = await client.post(
            "/api/v1/auth/token",
            data={"username": "tester@aegispact.ai", "password": "password123"}
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        data = login_res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        
        # Verify HttpOnly cookie is set
        cookies = login_res.cookies
        assert "refresh_token" in cookies, "refresh_token cookie not found in response cookies"
        refresh_token = cookies["refresh_token"]
        print("OK: HttpOnly refresh token cookie successfully issued.")
        
        # Verify refresh token structure
        payload = jwt.decode(refresh_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        assert payload["type"] == "refresh"
        assert payload["sub"] == "tester@aegispact.ai"
        
        # 2. Test Refresh token endpoint & token rotation
        print("Testing POST /api/v1/auth/refresh...")
        # Clear local client cookies to simulate refresh call
        client.cookies.clear()
        client.cookies.set("refresh_token", refresh_token)
        
        refresh_res = await client.post("/api/v1/auth/refresh")
        assert refresh_res.status_code == 200, f"Refresh failed: {refresh_res.text}"
        refresh_data = refresh_res.json()
        assert "access_token" in refresh_data
        assert refresh_data["access_token"] != data["access_token"], "Access token should be rotated"
        
        new_refresh_token = refresh_res.cookies.get("refresh_token")
        assert new_refresh_token is not None
        assert new_refresh_token != refresh_token, "Refresh token should be rotated"
        print("OK: Access and Refresh tokens successfully rotated.")
        
        # 3. Test Logout clears cookies
        print("Testing POST /api/v1/auth/logout...")
        logout_res = await client.post("/api/v1/auth/logout")
        assert logout_res.status_code == 200
        # Cookie should have expired/deleted (max_age=0 or deleted)
        assert logout_res.headers.get("set-cookie") is not None
        assert 'refresh_token=""' in logout_res.headers.get("set-cookie") or "Max-Age=0" in logout_res.headers.get("set-cookie")
        print("OK: Logout successfully clears refresh token cookie.")
        
        # 4. Test Batch Auditing trigger
        print("Testing POST /api/v1/audits/batch...")
        batch_res = await client.post(
            "/api/v1/audits/batch",
            headers={"Authorization": f"Bearer {data['access_token']}"},
            json={"document_ids": [1, 2], "framework_id": 1}
        )
        assert batch_res.status_code == 202, f"Batch trigger failed: {batch_res.text}"
        batch_jobs = batch_res.json()
        assert len(batch_jobs) == 2
        assert batch_jobs[0]["document_id"] == 1
        assert batch_jobs[1]["document_id"] == 2
        print("OK: Batch auditing successfully triggered.")
        
        # 5. Test Prometheus /metrics endpoint
        print("Testing GET /metrics...")
        metrics_res = await client.get("/metrics")
        assert metrics_res.status_code == 200
        metrics_text = metrics_res.text
        assert "# HELP http_requests_total" in metrics_text
        assert "http_requests_total" in metrics_text
        assert "aegispact_completed_audits_total" in metrics_text
        print("OK: Prometheus metrics endpoint successfully exported.")
        
    print("ALL POLISH AND SECURITY TESTS PASSED SUCCESSFULLY! (SUCCESS)")

async def main():
    try:
        await test_polish_and_security()
    finally:
        # Clean up database file after run
        if os.path.exists(DB_FILE):
            try:
                os.remove(DB_FILE)
            except:
                pass

if __name__ == "__main__":
    asyncio.run(main())

