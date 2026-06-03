-- ClaimShield AI database initialization
-- Run once against a fresh Postgres instance that has pgvector installed

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------
-- Payer policy chunks (primary vector store for retrieval)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS policy_chunks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payer_id    TEXT NOT NULL,
    plan_type   TEXT NOT NULL,          -- e.g. "commercial", "medicare_advantage"
    cpt_codes   TEXT[] NOT NULL DEFAULT '{}',
    icd10_codes TEXT[] NOT NULL DEFAULT '{}',
    source_doc  TEXT NOT NULL,          -- document title / filename
    page_num    INTEGER,
    chunk_index INTEGER NOT NULL,
    content     TEXT NOT NULL,
    embedding   vector(3072),           -- gemini-embedding-001/2 dimensions
    metadata    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_chunks_payer_plan
    ON policy_chunks (payer_id, plan_type);

CREATE INDEX IF NOT EXISTS idx_policy_chunks_cpt
    ON policy_chunks USING GIN (cpt_codes);

-- Vector index: pgvector's ivfflat/hnsw cap at 2000 dims in most builds.
-- gemini-embedding-001 outputs 3072 dims which exceeds this limit.
-- For the MVP/demo corpus (<100 chunks), sequential cosine scan is fast enough.
-- Production upgrade path: pgvector >= 0.7.4 + halfvec column or dimensionality
-- reduction via output_dimensionality when the embedding API supports it.
-- CREATE INDEX IF NOT EXISTS idx_policy_chunks_embedding
--     ON policy_chunks USING hnsw (embedding vector_cosine_ops)
--     WITH (m = 16, ef_construction = 64);

-- ----------------------------------------------------------------
-- Demo cases (pre-seeded scenarios)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demo_cases (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id         TEXT UNIQUE NOT NULL,
    label           TEXT NOT NULL,
    description     TEXT,
    patient_data    JSONB NOT NULL,
    order_data      JSONB NOT NULL,
    scenario_tags   TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- Workflow runs (audit trail for each PA request processed)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_runs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id          TEXT UNIQUE NOT NULL,
    order_id        TEXT NOT NULL,
    patient_id      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending|running|complete|error
    current_step    TEXT,
    state_snapshot  JSONB DEFAULT '{}'::jsonb,
    artifacts       JSONB DEFAULT '{}'::jsonb,
    error_detail    TEXT,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_order
    ON workflow_runs (order_id);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
    ON workflow_runs (status);
