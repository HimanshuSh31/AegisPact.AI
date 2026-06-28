# AegisPact.AI - Automated Multi-Modal Contract & Compliance Auditor

An enterprise-grade, microservices-oriented legal technology application designed to ingest complex multi-page contracts, extract visual layout text/tables, index them into a vector space, run hybrid retrieval audits against compliance framework criteria, and evaluate quality using MLOps Ragas metrics.

---

## 🏛️ Architectural Blueprint

The application is structured as a decoupled, event-driven microservices architecture:

*   **Frontend Gateway:** Next.js (React 18+, TypeScript, Tailwind CSS, Lucide icons) providing a glassmorphic dashboard for uploads, background task tracking, and side-by-side legal diff highlights.
*   **API Gateway:** FastAPI (Asynchronous Python 3.11+) implementing OAuth2/JWT authentication, Pydantic v2 data validations, CORS middleware, and API endpoints.
*   **Task Queue & Orchestration:** Celery worker backed by a Redis broker. Performs heavy layout parsing and RAG evaluation out-of-band to prevent gateway timeouts.
*   **Storage Layers:**
    *   *Metadata & Relational:* PostgreSQL (via SQLAlchemy/SQLModel async) to track users, organizations, documents, compliance scorecards, and findings.
    *   *Vector DB:* Qdrant (or persistent ChromaDB) to perform dense similarity search.

---

## 🚀 Key Pipelines & Features

### 📋 Stage A: Multi-Modal Layout Parsing (`parser.py`)
*   Extracts reading-order text paragraphs, headers, and visual bounding box coordinates.
*   Isolates tabular data and transforms it cleanly into Markdown grid structures for optimized LLM context injection.
*   Natively supports both PDF/Docx documents (via `pdfplumber`/`unstructured`) and plain text files.

### 🔍 Stage B: Hybrid RAG & Verification Engine (`rag_engine.py`)
*   *Semantic Chunker:* Dynamic semantic windowing to keep legal clauses logically coherent.
*   *Dense Search:* Embedding indexing and vector search using local or remote models.
*   *Sparse Search:* Self-contained BM25 term retriever to catch exact legal clause cross-references.
*   *Hybrid Routing:* Merges Dense and Sparse retrievers using **Reciprocal Rank Fusion (RRF)**.
*   *LLM Auditor:* Constrained schema prompting targeting local Ollama (Llama3/Mistral) or cloud endpoints, enforcing citation and page tracking.

### 📊 Stage C: MLOps Quality Evaluation (`evaluator.py`)
*   Runs post-audit evaluations using the **Ragas** framework to compute:
    1.  **Faithfulness:** Factual groundedness of reasoning context (detecting hallucinations).
    2.  **Answer Relevance:** Precision of auditor explanations.
    3.  **Context Recall:** Comprehensiveness of retrieved clauses.
*   Outputs structured JSON traces using `structlog` for performance auditing.

---

## 🛠️ Installation & Setup

### Option 1: Full Microservices Deployment (Docker)
1. Verify Docker Desktop is running.
2. Build and boot the stack:
   ```bash
   docker-compose up --build -d
   ```
3. Access the APIs at `http://localhost:8000/docs` and Next.js frontend at `http://localhost:3000`.

### Option 2: Standalone Local Launch (Without Docker/Redis)
The API contains auto-detection connection checks. If Redis is offline, it automatically enables **Celery Eager Mode** (inline synchronous task execution) and uses **SQLite** (`contract_auditor.db`) for zero-configuration testing.

#### 1. Start the Backend API
1. Install Python requirements:
   ```bash
   pip install -r backend/requirements.txt
   ```
2. Launch the server in eager mode:
   ```bash
   $env:DATABASE_URL="sqlite+aiosqlite:///./contract_auditor.db"
   $env:CELERY_ALWAYS_EAGER="True"
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
3. View documentation at `http://localhost:8000/docs`.

#### 2. Start the Frontend Dashboard
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install packages and run development server:
   ```bash
   npm.cmd install
   npm.cmd run dev
   ```
3. Open `http://localhost:3000` in your web browser.

---

## 🧪 Testing & Demos

*   **Integration Tests:** Validate database registers, parser manifolds, retrieval metrics, and Ragas fallback computations:
    ```bash
    python backend/tests/test_integration.py
    ```
*   **Live API Demo:** Runs a mock registration, token retrieve, document text upload, RAG audit run, and findings output directly against `http://localhost:8000`:
    ```bash
    python backend/tests/run_live_demo.py
    ```
