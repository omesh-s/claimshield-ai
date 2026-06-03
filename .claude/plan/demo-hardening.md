# Demo Hardening Plan — ClaimShield AI (Hackathon Live Demo)

**Scope:** Final pre-demo audit across 6 parallel workstreams. **No large rewrites** — only small, high-leverage fixes.

**Context source:** Codebase review (backend workflow, SSE, cache, demo data, frontend order flow, proxy, docker-compose, `scripts/verify_data.py`). External Codex/Gemini agents were **not invoked** (`codeagent-wrapper` not present on this machine).

---

## Ranked fixes by workstream

### 1. Backend logic & LangGraph state machine

| Rank | Fix | Why (leverage) | Effort |
|------|-----|----------------|--------|
| **P0** | Add **demo-score cache bypass** control: `POST /admin/clear-cache` already exists — document clearing `score:*` keys before first live run of each demo case | Repeat DEMO-002 runs during rehearsal already hit 60m Redis cache; judges may see stale/wrong score on first click if cache warmed with bad data | S |
| **P0** | Ensure **`run_workflow` always emits terminal SSE** on early exit (detect error / PA not required): verify `process_order` `complete` event includes `step_statuses` + partial `result` | Frontend can hang in “running” if stream ends without `complete` | S |
| **P1** | Remove dead **`event_generator` v1** block in `process_order.py` (lines ~138–171) — only `event_generator_v2` is used | Reduces confusion during last-minute debugging | S |
| **P1** | In `_run_score`, **align criteria count**: pad/truncate `scores` list to `len(pa_criteria)` when LLM returns fewer/more rows | Prevents readiness % jumping when score array length ≠ criteria count | S |
| **P2** | Wire **`set_workflow_state`** in `run_workflow` final return (optional) | Enables recovery if you add a “resume run” debug endpoint later | M |
| **Defer** | Replace sequential `run_workflow` with `workflow_app.ainvoke` | No demo benefit; risk of regression | L |

---

### 2. Frontend UI state & UX clarity

| Rank | Fix | Why (leverage) | Effort |
|------|-----|----------------|--------|
| **P0** | **Load demo cases from API** (`GET /demo-cases/{case_id}`) in `loadDemoCase` instead of hardcoded `DEMO_CASES` orders | Frontend DEMO-001 uses wrong NPI/provider vs backend `ORDER_REQUESTS` — breaks narrative consistency | S |
| **P0** | Handle **`heartbeat` SSE events** in `submitOrder` (no-op or subtle “still working” indicator) | Long draft/score steps can exceed 120s queue wait; heartbeats already sent by backend | S |
| **P0** | On workflow **`error` / catch**, reset `isRunning` and show **“Retry”** + preserved form | Demo recovery after Gemini timeout without page refresh | S |
| **P1** | **DEMO-003 mismatch modal**: add copy that workflow **continues in background**; optional “Cancel run” only if you add AbortController | Modal appears mid-stream but doesn’t block backend — judges may be confused | S |
| **P1** | Disable **Submit** + demo buttons while `isRunning`; re-enable on `complete`/`error` | Prevents double-submit and overlapping SSE streams | S |
| **P1** | After **Approve & Package**, call `recordsApi.listPackages()` or navigate to `/records` with toast link | Closes loop for “package appears in table” demo beat | S |
| **P2** | Show **readiness score + pass/flag/fail** prominently when `scoring` arrives (not only after full complete) | Makes Score step visible during live narration | M |
| **Defer** | Full redesign of order page layout | Out of scope for hardening | L |

---

### 3. Demo data integrity (DEMO-001 / 002 / 003)

| Rank | Fix | Why (leverage) | Effort |
|------|-----|----------------|--------|
| **P0** | **Single source for orders**: frontend must use `ORDER_REQUESTS` via `GET /demo-cases/{id}` (see #2) | Known drift: DEMO-001 frontend `ordering_provider_npi: 1234567890` / `Dr. Sarah Chen` vs backend `1245319599` / `Dr. Patricia Hayes` | S |
| **P0** | Run **`python scripts/verify_data.py`** before demo; add to README “demo checklist” | Confirms 9 chunks, 3 demo_cases, Redis, per-payer retrieval | S |
| **P1** | Align **payer display names** everywhere: `demo_cases.py` payer map vs `FILING_DEADLINES.payerName` vs order page `PAYER_OPTIONS` | “United Healthcare HMO” vs “United Healthcare” — pick one label per payer_id | S |
| **P1** | **Unify filing deadline data**: point `demo_cases.FILING_DEADLINE_RULES` / API at `app/data/filing_deadlines.py` OR map deadlines page rows to `GET /demo-cases/filing-rules/all` | Two backend + one frontend source still coexist (95d TX vs 90d payer-specific) | M |
| **P1** | DEMO-003: ensure **patient_id P003**, CPT **75571**, ICD **J18.9** on denial/records/deadlines rows | Code mismatch story depends on consistent IDs | S |
| **P2** | Add **`clinical_notes`** preview when demo case loads (read-only snippet) | Helps narrator explain missing cardiology note without opening backend | M |
| **Defer** | DB-only demo cases (remove frontend constants entirely) | Good hygiene, not required for demo day | M |

---

### 4. Security & config

| Rank | Fix | Why (leverage) | Effort |
|------|-----|----------------|--------|
| **P0** | **Pre-demo env checklist**: `GOOGLE_API_KEY`, `BACKEND_URL=http://127.0.0.1:8001/api/v1` in `frontend/.env.local`, `ADMIN_API_KEY` changed from default | Default admin key + wrong port/IPv6 caused prior demo failures | S |
| **P0** | Confirm **`.env` not committed** (backend `.gitignore` already lists `.env`) | Secret leak risk | S |
| **P1** | Add **`frontend/.env.example`** with `BACKEND_URL=http://127.0.0.1:8001/api/v1` | Onboarding + judge laptop setup | S |
| **P1** | Restrict **`allowed_origins`** in production demo laptop only if serving frontend from non-localhost | Low risk for hackathon localhost setup | S |
| **P2** | Rate limit bypass for localhost in `check_rate_limit` when Redis down (already allows) — document 30 req/min | Unlikely to hit during demo | S |
| **Defer** | Auth on all API routes | Not needed for synthetic demo | L |

---

### 5. Performance & caching (Redis + pgvector)

| Rank | Fix | Why (leverage) | Effort |
|------|-----|----------------|--------|
| **P0** | **Warm caches before demo**: run each demo case once OR `POST /admin/clear-cache` then one controlled run | First run embeds + LLM = 60–90s; warmed policy cache + score cache = faster repeats | S |
| **P0** | Ensure **Docker Redis + Postgres** up (`docker compose up -d`) before seed | Retrieval falls back to empty chunks if DB down; analyze quality drops | S |
| **P1** | Admin **`clear-cache`** should also delete `score:*` keys (extend `KEYS score:*` flush) | Score cache not cleared by policy-only flush today | S |
| **P1** | Log **`cache_hit`** in UI (retrieve step data already has `cache_hit`) — show badge “Policy cache hit” | Narrator can explain Redis value | S |
| **P2** | Lower **`retrieval_similarity_threshold`** only if verify script fails per-payer | 9-chunk corpus is tiny; unlikely needed | S |
| **Defer** | pgvector index / dimension change | Corpus size makes scan instant | L |

---

### 6. Demo-day failure modes & graceful degradation

| Rank | Fix | Why (leverage) | Effort |
|------|-----|----------------|--------|
| **P0** | **Printed fallback script**: if Gemini fails, use `POST /process-order/sync` + show JSON draft | Blocking endpoint already exists (`process_order.py`) | S |
| **P0** | **Backend proxy 502** message in UI (`AppShell` health + order page banner) | `route.ts` returns `{ error: "Backend unavailable" }` — user already sees “Backend offline” | S (verify) |
| **P0** | **Demo runbook** (1 page): start order, ports, clear cache, verify_data, three case expected outcomes | Reduces panic when Wi‑Fi/Gemini flaky | S |
| **P1** | Gemini failure: workflow already falls back in analyze/score/draft — add UI banner **“AI-assisted draft — manual review required”** when `errors` non-empty | Makes degradation visible, not silent | S |
| **P1** | **SSE timeout**: frontend `fetch` has no AbortSignal timeout — add 5–8 min client timeout with friendly message | Prevents infinite spinner | S |
| **P1** | **In-memory package store** resets on backend restart — note in demo script; re-assemble package if needed | Expected limitation | S |
| **P2** | Optional: seed **canned `WorkflowResult` JSON** for offline demo | Only if venue blocks Gemini | M |
| **Defer** | Circuit breaker / queue / worker pool | Over-engineering | L |

---

## Implementation Plan: Demo Hardening

### Task type
- [x] Backend (Codex-aligned)
- [x] Frontend (Gemini-aligned)
- [x] Fullstack (parallel P0 items)

### Technical solution (synthesized)

Focus the demo window on **determinism, data consistency, and visible recovery**:

1. **Backend:** Score cache + temp 0.0 already landed; extend admin cache clear, tighten score array handling, clean SSE terminal events.
2. **Frontend:** Load canonical demo orders from API; handle heartbeats and errors; disable double-submit; surface degradation.
3. **Data:** Eliminate frontend/backend order drift; run verify script; align deadline constants.
4. **Ops:** Env checklist, warm caches, 1-page runbook.

### Implementation steps (execution order)

**Phase A — Pre-demo ops (no code, ~15 min)**
1. `docker compose up -d` → `python -m app.ingestion.seed --wipe` (if DB empty)
2. `python scripts/verify_data.py` — all checks green
3. Start backend `127.0.0.1:8001`, frontend with `BACKEND_URL=http://127.0.0.1:8001/api/v1`
4. `curl` health + admin status with `X-Admin-Key`
5. Optional: `POST /admin/clear-cache` then one full pass per DEMO-00x

**Phase B — P0 code (parallel, ~2–3 hours)**
1. `order/page.tsx`: fetch demo case detail from API on load; heartbeat handler; error/retry UX; disable submit while running
2. `package_records` admin or `clear-cache`: flush `score:*`
3. `process_order.py`: delete dead generator; verify `complete` on all exit paths
4. `workflow.py`: normalize score list length vs criteria (small helper)
5. Add `frontend/.env.example` + README demo checklist section

**Phase C — P1 code (~1–2 hours)**
1. Unify filing deadline constants (backend `filing_deadlines.py` → demo_cases API)
2. Payer display name pass (grep `United`, `BCBS`, `Aetna`)
3. Admin clear-cache includes score keys; optional cache-hit badge on retrieve step
4. DEMO-003 modal copy; package flow toast → records page
5. Client-side SSE timeout (AbortController)

**Phase D — Demo rehearsal**
1. DEMO-001 ×3 → same readiness score (after first run, cache hits)
2. DEMO-002 ×3 → same score, all criteria met narrative
3. DEMO-003 → mismatch modal + complete workflow
4. Approve & package → `/records` table row
5. Kill backend → confirm “Backend offline” banner

### Key files

| File | Operation | Description |
|------|-----------|-------------|
| `frontend/app/(dashboard)/order/page.tsx` | Modify | API demo load, heartbeat, error/retry, submit guard |
| `frontend/lib/api.ts` | Modify | `demoCasesApi.get(caseId)` if missing |
| `backend/app/api/routes/process_order.py` | Modify | Remove dead SSE generator; verify complete event |
| `backend/app/core/workflow.py` | Modify | Score criteria alignment |
| `backend/app/api/routes/admin.py` | Modify | Clear `score:*` in clear-cache |
| `backend/app/data/demo_cases.py` | Modify | Import/share `filing_deadlines.py` |
| `frontend/lib/filing-deadlines.ts` | Modify | Align days with backend canonical |
| `scripts/verify_data.py` | Run | Pre-demo gate |
| `README.md` | Modify | Demo-day checklist (ports, env, cases) |

### Risks and mitigation

| Risk | Mitigation |
|------|------------|
| Gemini rate limit / timeout | Warm caches; use sync endpoint fallback; show degradation banner |
| Redis down | Cache functions no-op; workflow still runs (slower, non-deterministic scores) |
| Port 8000 zombie on Windows | Stay on 8001 + `127.0.0.1` in `.env.local` |
| Score cache hides bad first run | Clear cache before judging; document in runbook |
| Frontend/backend order drift | P0: load from `GET /demo-cases/{id}` |
| Package list empty after restart | Re-assemble once; seeded row in `_PACKAGE_STORE` |

### Demo script — expected outcomes

| Case | Expected behavior |
|------|-------------------|
| DEMO-001 | Gap: missing cardiology note; readiness &lt; 100%; denial mock works |
| DEMO-002 | All criteria met; high readiness; stable score across repeats |
| DEMO-003 | Mismatch modal (75571 + J18.9); workflow completes after confirm |
| Package | Row in Recent Packages after approve/assemble |
| Deadlines | Same day-count for payer as New Order widget |

### SESSION_ID (for `/ccg:execute`)

External multi-model sessions were **not created** (wrapper unavailable). Execute this plan directly in Agent mode or:

```
/ccg:execute .claude/plan/demo-hardening.md
```

---

## Out of scope (explicitly deferred)

- Full auth, multi-tenant, production deployment
- Replacing LangGraph with new orchestration
- Migrating in-memory package store to Postgres
- Rewriting order page UI
- pgvector indexing / embedding model change
