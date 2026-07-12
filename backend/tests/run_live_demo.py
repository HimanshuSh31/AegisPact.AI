import os
import sys
import time
import httpx

API_URL = "http://localhost:8000"

def run_live_demo():
    print("--- AUTOMATED MULTI-MODAL CONTRACT AUDITOR LIVE DEMO ---")
    
    # 1. Register User
    print("\n[Step 1] Registering organization and user...")
    register_payload = {
        "email": "lead.auditor@corporatesecurity.io",
        "password": "SecurePassword987!",
        "full_name": "Marcus Aurelius",
        "organization_name": "Empire Compliance LLC"
    }
    
    with httpx.Client(timeout=120.0) as client:
        # Register User
        res = client.post(f"{API_URL}/api/v1/auth/register", json=register_payload)
        if res.status_code == 201:
            print("Successfully registered user!")
            user_data = res.json()
            print(f"User ID: {user_data['id']}, Org ID: {user_data['organization_id']}")
        elif res.status_code == 400 and "already registered" in res.text:
            print("User already registered. Proceeding to login...")
        else:
            print(f"Failed to register user: {res.text}")
            return
            
        # 2. Login to get Access Token + HttpOnly Refresh Cookie
        print("\n[Step 2] Authenticating to retrieve JWT Token & Cookies...")
        login_data = {
            "username": register_payload["email"],
            "password": register_payload["password"]
        }
        res = client.post(f"{API_URL}/api/v1/auth/token", data=login_data)
        if res.status_code != 200:
            print(f"Failed to authenticate: {res.text}")
            return
            
        token_data = res.json()
        token = token_data["access_token"]
        refresh_cookie = res.cookies.get("refresh_token")
        print("Successfully authenticated. Token retrieved!")
        print(f"Cookie refresh_token present: {refresh_cookie is not None}")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test 2b: Refresh access token using cookie
        print("\n[Step 2b] Verifying HTTP-only Token Refresh Rotation...")
        refresh_res = client.post(f"{API_URL}/api/v1/auth/refresh")
        if refresh_res.status_code == 200:
            print("Successfully rotated Access Token and HTTP-only cookie!")
            token = refresh_res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
        else:
            print(f"Failed token refresh: {refresh_res.text}")
        
        # 3. Create Compliance Framework
        print("\n[Step 3] Registering GDPR compliance framework policies...")
        framework_payload = {
            "name": "General Data Protection Addendum Checks",
            "description": "Validates third-party service provider contracts for compliance with GDPR Articles 6 and 28.",
            "rules": [
                {
                    "rule_id": "GDPR-Art6-Consent",
                    "title": "Legitimate Consent Safeguards",
                    "description": "Verify that contract requires user's explicit opt-in consent for telemetry or location tracking."
                },
                {
                    "rule_id": "GDPR-Art28-Subprocessors",
                    "title": "Subprocessor List Disclosure",
                    "description": "Verify that providers disclose a list of authorized subprocessors and their locations."
                }
            ]
        }
        res = client.post(f"{API_URL}/api/v1/frameworks", json=framework_payload, headers=headers)
        if res.status_code == 200:
            framework = res.json()
            print(f"Framework created: ID {framework['id']}, Name: {framework['name']}")
        else:
            res = client.get(f"{API_URL}/api/v1/frameworks", headers=headers)
            framework = res.json()[0]
            print(f"Using existing Framework: ID {framework['id']}, Name: {framework['name']}")
            
        # 4. Upload Contract Text (Create multiple documents for batch testing)
        print("\n[Step 4] Uploading mock contract texts for layout parsing...")
        mock_contents = [
            """SERVICE PROVIDER AGREEMENT
            This agreement governs operations between AnalyticsCorp and its clients.
            Section A: Geolocation Telemetry.
            The provider logs user IP addresses and geolocation coordinates. Explicit consent is not gathered as tracking is enabled by default.
            Section B: Subprocessors.
            Client data is shared with DatabaseHosting Ltd (Dublin, Ireland).
            """,
            """VENDOR COMPLIANCE ADDENDUM
            This document sets security policies for vendor cloud databases.
            Section 1: Data Analytics.
            We gather anonymous identity cookies to target website visitors.
            Section 2: Subprocessors.
            TelemetryCore Inc (Oregon, USA) is an authorized data processor.
            """
        ]
        
        document_ids = []
        for idx, mock_content in enumerate(mock_contents):
            mock_file_path = f"mock_sla_contract_{idx}.txt"
            with open(mock_file_path, "w", encoding="utf-8") as f:
                f.write(mock_content)
            try:
                with open(mock_file_path, "rb") as f:
                    res = client.post(
                        f"{API_URL}/api/v1/documents/upload",
                        files={"file": (mock_file_path, f, "text/plain")},
                        headers=headers
                    )
                if res.status_code == 200:
                    doc = res.json()
                    document_ids.append(doc["id"])
                    print(f"Uploaded Doc #{idx+1}: {doc['name']} (ID: {doc['id']})")
                else:
                    print(f"Failed doc upload: {res.text}")
            finally:
                if os.path.exists(mock_file_path):
                    os.remove(mock_file_path)

        # 5. Trigger Batch Compliance Audit
        print(f"\n[Step 5] Triggering Batch Compliance Audit on documents: {document_ids}...")
        batch_payload = {
            "document_ids": document_ids,
            "framework_id": framework["id"]
        }
        res = client.post(f"{API_URL}/api/v1/audits/batch", json=batch_payload, headers=headers)
        if res.status_code == 202:
            jobs = res.json()
            print(f"Successfully scheduled {len(jobs)} batch audit jobs:")
            for j in jobs:
                print(f"  - Job #{j['id']} (Document: {j['document_id']}) Status: {j['status']}")
        else:
            print(f"Failed batch trigger: {res.text}")
            return
            
        # 6. Fetch Prometheus Metrics
        print("\n[Step 6] Scraping Prometheus Metrics Endpoint...")
        metrics_res = client.get(f"{API_URL}/metrics")
        if metrics_res.status_code == 200:
            print("Successfully scraped Prometheus metrics!")
            lines = [l for l in metrics_res.text.split("\n") if "http_requests_total" in l or "aegispact" in l]
            print("Sample active metrics:")
            for l in lines[:5]:
                print(f"  {l}")
        else:
            print(f"Failed scraping metrics: {metrics_res.text}")

        print("\n--- LIVE DEMO COMPLETED SUCCESSFULLY ---")

if __name__ == "__main__":
    run_live_demo()


if __name__ == "__main__":
    run_live_demo()
