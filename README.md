# ClaimShield AI

![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-0.1-FF6B35?logo=langchain&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-3.1--flash--lite-4285F4?logo=google&logoColor=white)

**AI-powered prior authorization and revenue cycle automation for U.S. healthcare providers.**

---

## 1. Project Overview

Prior authorization is one of the most costly administrative burdens in U.S. healthcare. Providers spend an estimated **$35 billion per year** on PA paperwork, with the average case requiring 43 minutes of staff time. Roughly **75% of denials are preventable** with correct documentation submitted the first time.

ClaimShield AI automates the full prior authorization workflow — from initial clinical order through denial appeal — using a five-step AI pipeline:

| Step | Name | What happens |
|------|------|-------------|
| 1 | **Detect** | Checks clearinghouse (X12 271) for PA requirement; validates CPT/ICD-10 pairing; flags code mismatches |
| 2 | **Retrieve** | Semantic search over payer policy corpus (pgvector cosine similarity); Redis cache for repeat queries; keyword fallback |
| 3 | **Analyze** | Gemini reads the patient's FHIR chart against retrieved policy criteria and produces a structured gap analysis |
| 4 | **Draft** | Gemini writes a full clinical justification letter citing specific guidelines and medical necessity evidence |
| 5 | **Score** | Gemini self-scores the draft against each criterion (pass / flag / fail) and outputs an overall readiness percentage |

> **Human-in-the-loop guarantee:** ClaimShield never auto-submits to a payer. Every AI output is a reviewable draft. Staff approve or edit before any submission.

---

## 2. Demo

> **Screenshot placeholder** — add `docs/screenshot.png` for a dashboard overview.

### Demo Cases

| ID | Payer | Procedure | Scenario |
|----|-------|-----------|----------|
| **DEMO-001** | BCBS Texas PPO | CT Coronary Angiography — CPT 75571 | Missing cardiology consult note; gap flagged; appeal drafted |
| **DEMO-002** | Aetna PPO | Physical Therapy — CPT 97110 | Eligibility pre-check; criteria met; clean auth package assembled |
| **DEMO-003** | United Healthcare | Cardiac Rehabilitation — CPT 93798 | Denial received; Gemini drafts appeal citing ACC/AHA 2021 guidelines |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       Next.js 16  (Port 3000)                     │
│   Dashboard · New Order · Filing Deadlines · Settings             │
│   SSE streaming · shadcn/ui · Tailwind CSS v4                     │
└─────────────────────────┬────────────────────────────────────────┘
                          │  HTTP  /  SSE
┌─────────────────────────▼────────────────────────────────────────┐
│                    FastAPI Backend  (Port 8000)                    │
│                                                                    │
│   LangGraph 5-Node State Machine                                  │
│   ┌────────┐  ┌──────────┐  ┌─────────┐  ┌───────┐  ┌────────┐  │
│   │ DETECT │→ │ RETRIEVE │→ │ ANALYZE │→ │ DRAFT │→ │ SCORE  │  │
│   └────────┘  └──────────┘  └─────────┘  └───────┘  └────────┘  │
│        │            │             │            │           │       │
│     X12 271      pgvector      Gemini       Gemini      Gemini    │
│     CPT/ICD    Redis cache   JSON mode     text gen    JSON mode  │
│     pairing    kw-fallback   FHIR chart   guidelines    scoring   │
│                                                                    │
│   Additional routes:                                               │
│     POST /denial/appeal   → Gemini appeal generation              │
│     POST /records/package → Payer-ready bundle assembly           │
│     GET  /admin/status    → Live system config                    │
└──────────┬───────────────────────────┬───────────────────────────┘
           │                           │
┌──────────▼──────────┐   ┌────────────▼───────────────┐
│  PostgreSQL 15      │   │  Redis 7                    │
│  + pgvector 0.8     │   │                             │
│                     │   │  policy_chunks:{payer}:{cpt}│
│  policy_chunks      │   │  (24 h TTL)                 │
│  (9 chunks,         │   │                             │
│   3072-dim embeds)  │   │  workflow state per run_id  │
│  demo_cases         │   │  rate limiting              │
│  workflow_runs      │   └─────────────────────────────┘
└─────────────────────┘
           │
┌──────────▼──────────────────────────┐
│  External / Mock APIs               │
│  Mock EHR    — FHIR R4 patient data │
│  Mock CH     — X12 271 eligibility  │
│  Google AI   — Gemini + Embeddings  │
└─────────────────────────────────────┘

Tech stack:
  Frontend  │ Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui
  Backend   │ FastAPI 0.111 · Python 3.11 · LangGraph 0.1 · LangChain 0.2
  AI        │ Gemini 3.1 Flash Lite (generation) · Gemini Embedding 001 (3072-dim)
  Database  │ PostgreSQL 15 + pgvector 0.8 · Redis 7
  Infra     │ Docker Compose (local dev)
```

---

## 4. Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Python | **3.11+** | `python --version` |
| Node.js | **18+** | `node --version` |
| PostgreSQL | **15+** with pgvector extension | `psql --version` |
| Redis | **7+** | `redis-server --version` |
| Docker Desktop | Latest (optional, for managed Postgres + Redis) | `docker --version` |
| Google Cloud API key | Gemini access enabled | [aistudio.google.com](https://aistudio.google.com/app/apikey) |

> **Fastest path:** use Docker Compose to start Postgres + Redis with one command — no manual database setup required.

---

## 5. Setup & Installation

### Step 1 — Clone the repo

```bash
git clone <repo-url>
cd ClaimShieldAI
```

### Step 2 — Start infrastructure (Postgres + Redis)

```bash
docker compose up -d
```

Wait ~10 seconds. Postgres listens on `5432`, Redis on `6379`.

### Step 3 — Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

Copy and fill the environment file:

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```dotenv
GOOGLE_API_KEY=your_google_api_key_here
```

Seed the database (embeds 9 policy chunks via Gemini — takes ~2 min due to API rate limits):

```bash
python -m app.ingestion.seed --wipe
```

Start the API server:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Verify:

```bash
curl http://127.0.0.1:8000/api/v1/health
# → {"status":"ok","version":"0.1.0","environment":"development"}
```

### Step 4 — Frontend

Open a new terminal:

```bash
cd frontend
npm install
```

Copy the environment file:

```bash
cp .env.example .env.local
```

Default content (no changes needed if backend is on port 8000):

```dotenv
BACKEND_URL=http://127.0.0.1:8000/api/v1
```

Start the dev server:

```bash
npm run dev
```

### Step 5 — Open the app

Navigate to **http://localhost:3000**

Click **New Order** → **Load Demo Case** → select **DEMO-001** → click **Submit for Prior Authorization**.

---

## 6. Environment Variables

All variables live in `backend/.env`. Copy from `backend/.env.example`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_API_KEY` | **Yes** | — | Google Generative AI key with Gemini access |
| `GEMINI_MODEL` | No | `models/gemini-3.1-flash-lite` | LLM model for generation and scoring |
| `EMBEDDING_MODEL` | No | `models/gemini-embedding-001` | Embedding model (3072-dim) |
| `EMBEDDING_MODEL_FALLBACK` | No | `models/gemini-embedding-2` | Fallback embedding model |
| `EMBEDDING_DIMENSIONS` | No | `3072` | Vector dimensions — must match seeded embeddings |
| `DATABASE_URL` | No | `postgresql+asyncpg://claimshield:claimshield@localhost:5432/claimshield` | Async Postgres connection URL |
| `DATABASE_URL_SYNC` | No | `postgresql+psycopg2://...` | Sync Postgres URL (used by seed script) |
| `REDIS_URL` | No | `redis://localhost:6379/0` | Redis connection URL |
| `POLICY_CHUNK_CACHE_TTL_SECONDS` | No | `86400` | Redis TTL for policy chunk cache (24 h) |
| `LLM_TEMPERATURE` | No | `0.1` | Generation temperature |
| `LLM_MAX_TOKENS` | No | `4096` | Max tokens per Gemini response |
| `LLM_TIMEOUT_SECONDS` | No | `60` | Hard timeout per Gemini call |
| `ADMIN_API_KEY` | No | `claimshield-admin-2024` | API key for `/admin/*` endpoints |
| `ALLOWED_ORIGINS` | No | `["http://localhost:3000"]` | CORS allowed origins |
| `ENVIRONMENT` | No | `development` | Runtime environment label |

---

## 7. Running the Demo

### Full workflow — DEMO-001 (recommended for judges)

1. Open **http://localhost:3000**
2. Click **New Order** in the sidebar
3. Click **Load Demo Case** → select **DEMO-001 "Missing Cardiology Note"** (James Mitchell, BCBS Texas PPO, CPT 75571)
4. Click **Submit for Prior Authorization**
5. Watch the 5-step animated progress bar — each step shows a live elapsed counter, then a green checkmark
6. When complete, review:
   - **Gap Analysis**: 2 criteria met (green), 1 missing — the cardiology consult note (red)
   - **AI Self-Score**: ~67% readiness, amber "Needs Revision", per-criterion pass/flag/fail pills
   - **Draft Letter**: ~400-word clinical justification letter, editable inline
7. Click **Approve and Package Records** — view the submission checklist and chart artifacts
8. Click **Trigger Mock Denial** in the left panel — Gemini auto-drafts an appeal letter

### Eligibility pre-check — DEMO-002

1. Click **Reset Workspace** → **Load Demo Case** → **DEMO-002** (Aetna, PT CPT 97110)
2. Submit — the Detect step confirms eligibility via X12 271; no missing criteria
3. Inspect the clean auth package assembled automatically

### Denial appeal — DEMO-003

1. Click **Reset Workspace** → **Load Demo Case** → **DEMO-003** (United Healthcare, Cardiac Rehab)
2. Submit — workflow processes the existing denial
3. View the appeal letter in the **Appeal Letter** tab, citing ACC/AHA 2021 guidelines

### Code mismatch detection

Manually set CPT `75571` (cardiac imaging) with ICD-10 `J18.9` (pneumonia) and submit. A blocking modal fires within the Detect step: **"Unusual Code Pairing Detected"** — staff must explicitly confirm or go back before the workflow continues.

---

## 8. API Reference

Base URL: `http://127.0.0.1:8000/api/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check — returns status, version, environment |
| `POST` | `/process-order` | Run the 5-step PA workflow; streams progress as SSE |
| `GET` | `/demo-cases` | List all available demo cases |
| `GET` | `/demo-cases/{case_id}` | Get full details for a specific demo case |
| `GET` | `/denial/{denial_id}` | Fetch a denial event by ID |
| `POST` | `/denial/appeal` | Generate a Gemini-drafted appeal letter for a denial |
| `POST` | `/records/package` | Assemble a payer-ready clinical record bundle |
| `GET` | `/retrieval-test` | Debug endpoint — inspect RAG results for a payer/CPT/query |
| `GET` | `/pitch-context` | Returns business metrics (TAM/SAM, pricing, IP moat) |
| `GET` | `/admin/status` | Live system config: Redis, DB, LLM model, env | 
| `POST` | `/admin/reseed` | Re-register in-memory mock EHR and clearinghouse data |
| `POST` | `/admin/clear-cache` | Flush all Redis policy chunk cache entries |

### POST `/process-order` — SSE stream format

```json
// Progress event (one per step)
{ "event": "step_update", "current_state": "retrieve", "status": "running", "data": {} }

// Completion event
{ "event": "complete", "run_id": "abc123", "result": { ...WorkflowResult... } }

// Error event
{ "event": "error", "run_id": "abc123", "message": "Gemini timeout" }
```

### POST `/denial/appeal` — request body

```json
{
  "denial_id": "DENIAL-P001-001",
  "patient_id": "P001",
  "additional_context": "Patient has documented cardiac history"
}
```

### POST `/records/package` — request body

```json
{
  "run_id": "run-xyz",
  "patient_id": "P001",
  "order_id": "ORDER-001",
  "payer_id": "bcbs_tx"
}
```

---

## 9. AI Components

### Multi-Pipeline RAG (Retrieval-Augmented Generation)

Policy chunks are embedded at seed time using `gemini-embedding-001` (3072 dimensions) and stored in PostgreSQL with pgvector. At query time:

1. **Vector search** — cosine similarity over `policy_chunks` filtered by `payer_id` and `cpt_code`; returns top-K chunks above a configurable similarity threshold
2. **Redis cache** — results keyed by `policy_chunks:{payer_id}:{cpt_code}` with 24-hour TTL; cache hits are flagged in retrieval metadata
3. **Keyword fallback** — if vector search returns fewer than 2 results, a keyword-based SQL `ILIKE` search runs as a safety net

### LangGraph 5-Node State Machine

The workflow is defined as a directed LangGraph graph with nodes: `detect → retrieve → analyze → draft → score`. State flows sequentially for SSE compatibility; each node receives the full `WorkflowState` and returns partial updates. The graph is compiled to a runnable and executed step-by-step with per-node streaming.

### Gemini 3.1 Flash Lite

Three distinct Gemini calls in the workflow:

| Step | Mode | Purpose |
|------|------|---------|
| Analyze | `application/json` | Parse FHIR chart against policy criteria; output structured gap analysis |
| Draft | Text generation | Write clinical justification letter with guideline citations |
| Score | `application/json` | Evaluate draft against each criterion; output pass/flag/fail + readiness % |

All calls are wrapped in a `tenacity` retry policy (exponential backoff, 3 attempts) and a 30-second asyncio hard timeout.

### Redis Semantic Caching

Policy chunk retrieval results are cached per `(payer_id, cpt_code)` key with a configurable TTL (default 24 h). Cache hit/miss status is surfaced in the UI retrieval panel so reviewers can see whether results came from pgvector or cache.

### Self-Scoring Layer

After drafting, Gemini re-reads the letter and scores it against each payer criterion individually:

- **Pass** — criterion clearly met with supporting evidence
- **Flag** — criterion partially addressed; may need additional documentation
- **Fail** — criterion not met; gap requires action before submission

The overall score is the proportion of passed criteria. Scores below 80% display an amber "Needs Revision" badge.

---

## 10. Project Structure

```
ClaimShieldAI/
├── backend/
│   ├── app/
│   │   ├── api/routes/
│   │   │   ├── process_order.py    # SSE workflow endpoint
│   │   │   ├── denial.py           # Denial lookup + appeal generation
│   │   │   ├── package_records.py  # Clinical bundle assembly
│   │   │   ├── demo_cases.py       # Demo case registry
│   │   │   ├── retrieval_test.py   # RAG debug endpoint
│   │   │   ├── admin.py            # Admin endpoints (status, cache, reseed)
│   │   │   └── health.py           # Health check
│   │   ├── core/
│   │   │   ├── workflow.py         # LangGraph 5-step state machine
│   │   │   └── config.py           # Settings (pydantic-settings, absolute .env path)
│   │   ├── data/                   # Seeded mock payer/clinical data
│   │   ├── mocks/                  # FHIR R4 EHR + X12 clearinghouse mocks
│   │   ├── services/
│   │   │   ├── llm.py              # Gemini generation + embedding calls
│   │   │   ├── retrieval.py        # pgvector + Redis retrieval pipeline
│   │   │   ├── rules.py            # PA requirement and code-pairing rules
│   │   │   └── cache.py            # Redis client
│   │   ├── ingestion/seed.py       # pgvector seed script
│   │   └── models/schemas.py       # Pydantic request/response schemas
│   ├── requirements.txt
│   ├── .env                        # Local secrets (gitignored)
│   └── .env.example                # Starter template
├── frontend/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx            # Dashboard home
│   │   │   ├── order/page.tsx      # Main PA workspace (SSE + results)
│   │   │   ├── deadlines/page.tsx  # Filing deadline tracker
│   │   │   └── settings/page.tsx   # System settings + model status
│   │   └── api/backend/[...path]/  # Next.js → FastAPI proxy
│   ├── components/
│   │   ├── layout/AppShell.tsx     # Sidebar + topbar
│   │   └── ui/                     # shadcn/ui components
│   ├── lib/api.ts                  # REST + SSE API client
│   ├── types/index.ts              # TypeScript mirrors of Pydantic schemas
│   └── .env.local                  # Frontend env (BACKEND_URL)
├── docker-compose.yml              # Postgres 15 + pgvector + Redis 7
└── README.md
```

---

## 11. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Human-in-the-loop always** | No auto-submission. AI outputs are drafts; staff approves before any payer contact |
| **SSE over WebSocket** | Unidirectional streaming from FastAPI; simpler lifecycle, no socket management |
| **Sequential LangGraph** | Graph topology defined for architectural clarity; custom sequential runner gives SSE control per node |
| **pgvector over managed vector DB** | No external vector service; works fully offline after seed; zero extra cost |
| **Redis for policy cache only** | Cache hit/miss visible in UI — demonstrates real caching behaviour during demo |
| **Mock FHIR R4 + X12** | Production-realistic schemas without requiring live EHR or clearinghouse credentials |
| **Absolute `.env` path in config** | `Path(__file__).resolve()` ensures pydantic-settings finds `.env` regardless of working directory or `--reload` worker spawning |
| **No ivfflat/HNSW index** | pgvector 0.8 restricts HNSW to ≤2000 dims; Gemini embeddings are 3072-dim; sequential cosine scan is correct and fast for a 9-chunk demo corpus |

---

## 12. Team

**ClaimShield AI** — AI Hackathon 2026

Built to demonstrate that preventable prior authorization denials can be eliminated with production-quality AI tooling, not just demos.

---

*All patient data is synthetic. No real PHI is used or stored. This system is a demonstration prototype and is not FDA-cleared or intended for clinical use.*
