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
    
    with httpx.Client(timeout=30.0) as client:
        # Register User
        res = client.post(f"{API_URL}/api/auth/register", json=register_payload)
        if res.status_code == 201:
            print("Successfully registered user!")
            user_data = res.json()
            print(f"User ID: {user_data['id']}, Org ID: {user_data['organization_id']}")
        elif res.status_code == 400 and "already registered" in res.text:
            print("User already registered. Proceeding to login...")
        else:
            print(f"Failed to register user: {res.text}")
            return
            
        # 2. Login to get Access Token
        print("\n[Step 2] Authenticating to retrieve JWT Token...")
        login_data = {
            "username": register_payload["email"],
            "password": register_payload["password"]
        }
        res = client.post(f"{API_URL}/api/auth/token", data=login_data)
        if res.status_code != 200:
            print(f"Failed to authenticate: {res.text}")
            return
            
        token_data = res.json()
        token = token_data["access_token"]
        print("Successfully authenticated. Token retrieved!")
        
        headers = {"Authorization": f"Bearer {token}"}
        
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
        res = client.post(f"{API_URL}/api/frameworks", json=framework_payload, headers=headers)
        if res.status_code == 200:
            framework = res.json()
            print(f"Framework created: ID {framework['id']}, Name: {framework['name']}")
        else:
            # Check if it already exists, let's query all frameworks
            res = client.get(f"{API_URL}/api/frameworks", headers=headers)
            framework = res.json()[0]
            print(f"Using existing Framework: ID {framework['id']}, Name: {framework['name']}")
            
        # 4. Upload Contract Text
        print("\n[Step 4] Uploading mock contract text for layout parsing...")
        mock_file_path = "mock_sla_contract.txt"
        mock_content = """SERVICE PROVIDER AGREEMENT
This agreement governs operations between AnalyticsCorp and its clients.

Section A: Geolocation Telemetry.
The provider logs user IP addresses and geolocation coordinates. Explicit consent is not gathered as tracking is enabled by default.

Section B: Subprocessors.
Client data is shared with third party subcontractors:
- DatabaseHosting Ltd (Dublin, Ireland)
- TelemetryCore Inc (Oregon, USA)
"""
        with open(mock_file_path, "w", encoding="utf-8") as f:
            f.write(mock_content)
            
        try:
            with open(mock_file_path, "rb") as f:
                res = client.post(
                    f"{API_URL}/api/documents/upload",
                    files={"file": (mock_file_path, f, "text/plain")},
                    headers=headers
                )
            if res.status_code != 200:
                print(f"Failed to upload document: {res.text}")
                return
            document = res.json()
            print(f"Document uploaded! ID: {document['id']}, Name: {document['name']}, Parser Status: {document['status']}")
        finally:
            if os.path.exists(mock_file_path):
                os.remove(mock_file_path)

        # 5. Wait a brief moment for Celery eager processing (since eager is synchronous it is already COMPLETED)
        # Fetch document status to confirm
        res = client.get(f"{API_URL}/api/documents/{document['id']}", headers=headers)
        document = res.json()
        print(f"Document parsing status: {document['status']}")
        
        # 6. Trigger Compliance Audit Job
        print("\n[Step 5] Triggering Compliance Audit Job...")
        audit_payload = {
            "document_id": document["id"],
            "framework_id": framework["id"]
        }
        res = client.post(f"{API_URL}/api/audits/run", json=audit_payload, headers=headers)
        if res.status_code != 200:
            print(f"Failed to run audit: {res.text}")
            return
        job = res.json()
        print(f"Audit Job scheduled: ID {job['id']}, Status: {job['status']}")
        
        # 7. Query audit findings (since eager is synchronous, the job is already COMPLETED!)
        print("\n[Step 6] Retrieving Audit findings, Scorecard, and MLOps metrics...")
        res = client.get(f"{API_URL}/api/audits/{job['id']}", headers=headers)
        job = res.json()
        print(f"Audit completed! Compliance Score: {job['score']}%")
        print("MLOps Ragas Quality score:")
        print(f"  - Faithfulness: {job['eval_result'].get('faithfulness')}")
        print(f"  - Answer Relevance: {job['eval_result'].get('answer_relevance')}")
        print(f"  - Context Recall: {job['eval_result'].get('context_recall')}")
        
        # Fetch detailed findings
        res = client.get(f"{API_URL}/api/audits/{job['id']}/findings", headers=headers)
        findings = res.json()
        print("\nCompliance Findings:")
        for idx, f in enumerate(findings):
            print(f"\nFinding #{idx+1}: [{f['status']}] (Severity: {f['severity']})")
            print(f"  Rule Code: {f['rule_id']}")
            print(f"  Verbatim Citation: '{f['clause_text']}'")
            print(f"  Auditor Explanation: {f['explanation']}")
            
        print("\n--- LIVE DEMO COMPLETED SUCCESSFULLY ---")

if __name__ == "__main__":
    run_live_demo()
