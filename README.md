<div align="center">

<img src="https://img.shields.io/badge/AegisPact.AI-Enterprise%20Compliance-6366f1?style=for-the-badge&logo=shield&logoColor=white" alt="AegisPact.AI" />

# AegisPact.AI

### Automated Multi-Modal Contract & Compliance Auditor

[![CI](https://github.com/HimanshuSh31/AegisPact.AI/actions/workflows/test.yml/badge.svg)](https://github.com/HimanshuSh31/AegisPact.AI/actions/workflows/test.yml)
[![Python](https://img.shields.io/badge/Python-3.11-3776ab?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![License](https://img.shields.io/badge/License-MIT-emerald?style=flat)](LICENSE)

*An enterprise-grade legal technology platform that ingests complex multi-page contracts, extracts visual layout structure, runs Hybrid RAG compliance auditing, and evaluates quality using MLOps Ragas metrics — all served through a glassmorphic real-time dashboard.*

</div>

---

## ✨ Feature Overview

| Layer | Feature |
|---|---|
| 📄 **Document Ingestion** | Drag-and-drop upload · PDF/DOCX/TXT parsing · Visual layout extraction |
| 🔍 **Hybrid RAG Engine** | Dense embedding search + BM25 sparse retrieval fused via Reciprocal Rank Fusion |
| 🤖 **LLM Compliance Audit** | Structured schema prompting via Ollama (Llama3/Mistral) with citation + page tracking |
| 📊 **MLOps Ragas Metrics** | Faithfulness · Answer Relevance · Context Recall scorecards per audit job |
| ⚡ **Real-time Streaming** | SSE progress stream + WebSocket live updates for background Celery jobs |
| 🔐 **Auth & Multi-Tenancy** | JWT OAuth2 · Per-organization data isolation · Role-based access |
| 🧩 **API v1 + Rate Limiting** | `/api/v1/` versioning · Redis-backed rate limits (200 req/min) · `X-Request-ID` tracing |
| 🖨️ **PDF Scorecard Reports** | One-click ReportLab PDF export compiling metadata, stats, MLOps metrics, and color-coded findings |
| 🔍 **RAG Search Explorer** | Dense vector similarity retriever to search and extract verbatim citation paragraphs |
| 💬 **Conversational RAG Chat** | Grounded chat interface enabling interactive Q&A directly with contract clauses |
| 📄 **OCR Scanned Fallback** | Automated OCR layout extraction using `pytesseract` to parse scanned images and signed docs |
| 🔄 **Audit Version Compare** | Side-by-side versions scorecard diff comparing compliance scores, metrics, and rule verdicts |
| ✍️ **Verdict Overrides** | Human-in-the-loop audit overrides to update compliance scores with justification notes |
| 🏥 **Health Probes** | `GET /api/v1/health` probes DB, Redis, and Qdrant with per-service status |
| 📋 **Structured Logging** | JSON log lines via `structlog` with `event`, `level`, `timestamp` and context fields |
| 🔔 **Toast Notifications** | Slide-in success/error/warning/info toasts on every user action |
| 💀 **Skeleton Loaders** | Shimmer placeholders for stats, documents, findings, and audit headers |
| 📱 **Mobile Responsive** | Slide-over sidebar with hamburger menu · 44px touch targets · Responsive grid |
| 🚀 **CI/CD** | GitHub Actions — Backend integration tests + Frontend TypeScript + ESLint on every push |
| 🐳 **Docker Stack** | Nginx reverse proxy · Flower Celery monitor · Full compose orchestration |

---

## 🏛️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Nginx Reverse Proxy (:80)             │
│              /api/ → FastAPI   /  → Next.js              │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴──────────────┐
        ▼                           ▼
┌──────────────┐           ┌──────────────────┐
│  Next.js 14  │           │   FastAPI /api/v1 │
│  Dashboard   │◄──SSE/WS──│   + SlowAPI RL   │
│  :3000       │           │   :8000          │
└──────────────┘           └────────┬─────────┘
                                    │
              ┌─────────────────────┼──────────────────┐
              ▼                     ▼                   ▼
      ┌──────────────┐    ┌──────────────────┐  ┌────────────┐
      │  PostgreSQL  │    │  Celery Workers  │  │   Qdrant   │
      │  (SQLModel)  │    │  + Redis Broker  │  │  VectorDB  │
      └──────────────┘    └──────────────────┘  └────────────┘
                                    │
                        ┌───────────┴───────────┐
                        ▼                       ▼
               ┌──────────────┐       ┌──────────────────┐
               │  Stage A:    │       │  Stage B:        │
               │  Layout      │──────►│  Hybrid RAG +    │
               │  Parser      │       │  LLM Auditor     │
               └──────────────┘       └────────┬─────────┘
                                               │
                                      ┌────────▼─────────┐
                                      │  Stage C:        │
                                      │  Ragas MLOps     │
                                      │  Evaluator       │
                                      └──────────────────┘
```

---

## 🚀 Key Pipelines

### 📋 Stage A — Multi-Modal Layout Parsing (`parser.py`)
- Extracts reading-order text paragraphs, headers, and visual bounding-box coordinates
- Isolates tabular data and transforms it into Markdown grid structures for optimized LLM context injection
- Supports PDF/DOCX (`pdfplumber` / `unstructured`) and plain text

### 🔍 Stage B — Hybrid RAG & Verification Engine (`rag_engine.py`)
- **Semantic Chunker:** Dynamic semantic windowing to keep legal clauses logically coherent
- **Dense Search:** Embedding indexing and vector search (local or remote models)
- **Sparse Search:** Self-contained BM25 term retriever for exact legal clause cross-references
- **Hybrid Routing:** Merges Dense + Sparse retrievers using **Reciprocal Rank Fusion (RRF)**
- **LLM Auditor:** Constrained schema prompting via Ollama (Llama3/Mistral) with citation + page tracking

### 📊 Stage C — MLOps Quality Evaluation (`evaluator.py`)
Runs post-audit scoring using the **Ragas** framework:

| Metric | Description |
|---|---|
| **Faithfulness** | Factual groundedness — detects hallucinations |
| **Answer Relevance** | Precision of auditor explanations |
| **Context Recall** | Comprehensiveness of retrieved contract clauses |

---

## 🖥️ Dashboard Pages

### Compliance Workspace (Dashboard)
- Stat cards with skeleton loaders showing Contracts Ingested, Active Jobs, Completed Audits, Avg Score
- Drag-and-drop document uploader with live progress bar
- Audit trigger panel — select document + framework → dispatch to Celery
- Real-time SSE progress stream showing live pipeline steps

### Audit Findings Detail (`/audit/[id]`)
- **Score ring** — animated SVG compliance percentage with colour coding (green ≥80%, amber ≥50%, red <50%)
- **Per-verdict tiles** — Compliant / Non-Compliant / Needs Review / N/A counts
- **Ragas quality bars** — Faithfulness, Answer Relevance, Context Recall
- **Expandable finding cards** — each card shows the cited contract clause, human override controls, and AI reasoning
- **Download PDF** — one-click action to download styled ReportLab scorecards
- **Filter tabs** — filter by verdict type

### RAG Citations Explorer (`/search`)
- Live vector search console to match semantic legal queries against parsed contract nodes
- Dynamic relevance percentage metrics showing cosine similarity confidence
- Source page references to instantly review original text bounds

### Audit Version Comparison (`/compare`)
- Select two historical audit runs side-by-side
- Full diffing analysis comparing compliance score differences, Ragas quality metrics, and rule verdict changes
- Verdict change indicators ("Improved!" / "Verdict Changed") highlighting redline revisions

### Login / Register
- Glassmorphic auth page with animated shield logo
- Tab-based Login / Register toggle

---

## 🛠️ Installation & Setup

### Option 1: Docker (Full Stack)

```bash
# Clone the repo
git clone https://github.com/HimanshuSh31/AegisPact.AI.git
cd AegisPact.AI

# Boot the full stack (API + Frontend + Redis + Qdrant + Nginx + Flower)
docker compose up --build -d
```

| Service | URL |
|---|---|
| Dashboard (Next.js) | http://localhost:3000 |
| API + Swagger Docs | http://localhost:8000/docs |
| Nginx Gateway | http://localhost:80 |
| Flower (Celery Monitor) | http://localhost:5555 |

### Option 2: Local Dev (No Docker)

> The API auto-detects when Redis is offline and switches to **Celery Eager Mode** (synchronous inline tasks) and **SQLite** — zero external dependencies needed.

#### Backend

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env

# Launch API (SQLite + eager Celery)
$env:DATABASE_URL="sqlite+aiosqlite:///./contract_auditor.db"
$env:CELERY_ALWAYS_EAGER="True"
$env:JWT_SECRET="your_secret_key_here"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Frontend

```bash
cd frontend
npm install

# Run locally in development mode (http://localhost:3000)
npm run dev

# Build and compile static HTML export (outputs to frontend/out)
npm run build
```

---

## 🌐 GitHub Pages Deployment

The frontend dashboard is configured to automatically deploy to GitHub Pages on every push modifying the `frontend` workspace:
- **Routing:** Uses client-side query string parameters (`/audit?id=[id]`) instead of dynamic path parameters to support static HTML hosting.
- **Base Prefix:** Production builds automatically prepend the `/AegisPact.AI` repository name prefix (via `next.config.mjs` dynamic checks) to resolve static assets, while keeping local dev prefix-free.
- **Workflow:** Deploys via `.github/workflows/deploy-pages.yml` to the `gh-pages` branch.

---

## 🔌 API Reference

All endpoints are versioned under `/api/v1/`. Interactive docs at **http://localhost:8000/docs**.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Register user & organization |
| `POST` | `/api/v1/auth/token` | Login and obtain JWT access token (sets HttpOnly refresh cookie) |
| `POST` | `/api/v1/auth/refresh` | Rotate and issue new access/refresh tokens using HttpOnly cookie |
| `POST` | `/api/v1/auth/logout` | Logout user and clear HttpOnly refresh cookie |
| `GET` | `/api/v1/documents` | List ingested documents (paginated) |
| `POST` | `/api/v1/documents/upload` | Upload a contract file |
| `GET` | `/api/v1/documents/{id}/search` | Semantic vector cosine similarity + keyword chunk search |
| `POST` | `/api/v1/documents/{id}/chat` | Conversational RAG Chat with message history and citations |
| `GET` | `/api/v1/frameworks` | List compliance frameworks |
| `POST` | `/api/v1/frameworks` | Create a new framework + rules |
| `POST` | `/api/v1/audits/run` | Dispatch a single contract compliance audit job |
| `POST` | `/api/v1/audits/batch` | Dispatch parallel compliance audit jobs for multiple contracts |
| `GET` | `/api/v1/audits` | List historical compliance audit jobs |
| `GET` | `/api/v1/audits/compare` | Compare two audit jobs side-by-side |
| `GET` | `/api/v1/audits/{id}` | Get audit job status + score |
| `GET` | `/api/v1/audits/{id}/findings` | Get per-rule findings |
| `GET` | `/api/v1/audits/{id}/pdf` | Download ReportLab styled PDF report scorecard |
| `POST` | `/api/v1/audits/{id}/findings/{finding_id}/override` | Submit a human verdict override justification |
| `GET` | `/api/v1/audits/{id}/stream` | SSE real-time progress stream |
| `WS` | `/ws/audit/{id}` | WebSocket live updates |
| `GET` | `/api/v1/health` | Health check (DB + Redis + Qdrant probes) |
| `GET` | `/metrics` | Prometheus exposition scraper endpoint (latencies, counts, DB stats) |

**Rate Limiting:** 200 req/min per IP (Redis-backed). Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

**Request Tracing:** Every response includes `X-Request-ID` for log correlation.

---

## 🧪 Testing

```bash
# Run core integration test suite
$env:DATABASE_URL="sqlite+aiosqlite:///:memory:"
$env:CELERY_ALWAYS_EAGER="True"
$env:JWT_SECRET="test_secret"
python backend/tests/test_integration.py

# Run advanced features integration test (PDF, Overrides, Compare, Search)
python backend/tests/test_advanced_features.py

# Run OCR parser & conversational RAG chat integration test
python backend/tests/test_ocr_chat.py
```

The core integration test covers all 6 pipeline steps:
1. Organization + User registration
2. Compliance Framework creation
3. Document registry + ingestion
4. Stage A Layout Parser (mocked PDF)
5. Stage B Hybrid RAG Audit (mocked LLM)
6. Results assertion — score, findings, Ragas metrics

The advanced integration test verifies overrides, PDF scorecard report downloads, vector semantic chunk search explorer, and version diff comparisons.
The OCR and Chat integration test verifies scanned document page rendering, dynamic OCR text extraction fallback, and conversational chat response grounding.

**CI:** GitHub Actions runs backend tests, frontend TypeScript compilation, and lint checks on every push.

---

## 📁 Project Structure

```
AegisPact.AI/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, routes, middleware
│   │   ├── auth.py          # JWT authentication
│   │   ├── config.py        # Environment settings
│   │   ├── database.py      # Async SQLAlchemy engine
│   │   ├── logger.py        # Structured JSON logging (structlog)
│   │   ├── middleware.py    # X-Request-ID tracing
│   │   ├── models.py        # SQLModel ORM + Pydantic schemas
│   │   ├── parser.py        # Stage A: Layout parser
│   │   ├── pdf_generator.py # ReportLab PDF generator
│   │   ├── rag_engine.py    # Stage B: Hybrid RAG engine
│   │   ├── evaluator.py     # Stage C: Ragas MLOps evaluator
│   │   └── worker.py        # Celery task definitions
│   ├── tests/
│   │   ├── test_integration.py
│   │   ├── test_advanced_features.py
│   │   ├── test_ocr_chat.py
│   │   └── run_live_demo.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx          # Main dashboard
│       │   ├── layout.tsx        # Root layout + ToastProvider
│       │   ├── globals.css       # Design tokens + animations
│       │   ├── login/page.tsx    # Auth page
│       │   ├── search/page.tsx   # RAG search explorer
│       │   ├── compare/page.tsx  # Audit compare page
│       │   ├── chat/page.tsx     # Conversational RAG chat page
│       │   └── audit/[id]/page.tsx  # Findings detail page
│       └── lib/
│           ├── api.ts            # Typed API client
│           ├── auth.ts           # Auth hook + token management
│           ├── toast.tsx         # Toast notification system
│           └── skeletons.tsx     # Skeleton loading components
├── nginx/
│   └── nginx.conf
├── .github/
│   └── workflows/test.yml    # CI/CD pipeline
├── docker-compose.yml
└── README.md
```

---

## 🔧 Environment Variables

Copy `backend/.env.example` and configure:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | PostgreSQL URL | SQLAlchemy async connection string |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis for Celery + rate limiting |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant vector database URL |
| `JWT_SECRET` | — | **Required.** Secret key for JWT signing |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama inference server |
| `OLLAMA_MODEL` | `llama3:8b` | Model for compliance reasoning |
| `UPLOAD_DIR` | `./uploads` | Local file storage directory |
| `SLACK_WEBHOOK_URL` | `None` | (Optional) URL to post scorecards to a Slack channel |
| `SMTP_HOST` | `None` | (Optional) Mail server host for HTML report delivery |
| `SMTP_PORT` | `587` | Port for outgoing mail delivery |
| `SMTP_USER` | `None` | Username for mail authentication |
| `SMTP_PASSWORD` | `None` | Password for mail authentication |
| `SMTP_FROM` | `alerts@aegispact.ai` | Sender address for report emails |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m "feat: description"`
4. Push and open a Pull Request

---

<div align="center">
  Built with ❤️ by <a href="https://github.com/HimanshuSh31">HimanshuSh31</a>
</div>
