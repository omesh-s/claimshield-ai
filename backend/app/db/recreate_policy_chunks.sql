CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS policy_chunks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payer_id    TEXT NOT NULL,
    plan_type   TEXT NOT NULL,
    cpt_codes   TEXT[] NOT NULL DEFAULT '{}',
    icd10_codes TEXT[] NOT NULL DEFAULT '{}',
    source_doc  TEXT NOT NULL,
    page_num    INTEGER,
    chunk_index INTEGER NOT NULL,
    content     TEXT NOT NULL,
    embedding   vector(3072),
    metadata    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_chunks_payer_plan
    ON policy_chunks (payer_id, plan_type);

CREATE INDEX IF NOT EXISTS idx_policy_chunks_cpt
    ON policy_chunks USING GIN (cpt_codes);

SELECT 'policy_chunks ready with vector(3072)' AS result;
