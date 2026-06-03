"""
Database seed script — embeds payer policy chunks and inserts them into pgvector.
Also inserts demo cases into the demo_cases table.

Usage:
    cd backend
    python -m app.ingestion.seed [--wipe] [--skip-embeddings]

Options:
    --wipe              Drop and re-insert all policy_chunks and demo_cases rows.
    --skip-embeddings   Insert chunks with zero-vector embeddings (no API key needed).

Requires:
    - Postgres running with pgvector (docker compose up -d)
    - GOOGLE_API_KEY set in .env (unless --skip-embeddings)

Implementation note:
    Uses asyncpg directly for INSERT statements so we can use positional
    parameters ($1..$N) with PostgreSQL-native type casts (::vector, ::jsonb).
    SQLAlchemy's text() + named params (:param) does not support ::type casts
    reliably across asyncpg driver versions.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from pathlib import Path

# Ensure backend root is on sys.path when run as __main__
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import asyncpg
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.data.payer_policies import POLICY_CHUNKS, PolicyChunkSeed
from app.data.demo_cases import DEMO_CASE_OPTIONS
from app.data.patients import ORDER_REQUESTS

configure_logging()
logger = get_logger("seed")
settings = get_settings()


# ---------------------------------------------------------------------------
# Asyncpg DSN helper
# ---------------------------------------------------------------------------

def _asyncpg_dsn() -> str:
    """Convert SQLAlchemy DSN to plain asyncpg DSN."""
    return settings.database_url.replace("postgresql+asyncpg://", "postgresql://")


# ---------------------------------------------------------------------------
# Embedding helper (mirrors llm.py fallback logic for standalone use)
# ---------------------------------------------------------------------------

def _embed_with_fallback(content: str, skip: bool) -> list[float]:
    """
    Embed content using text-embedding-004 with fallback to embedding-001.
    Returns zero vector when skip=True or all API calls fail.
    """
    if skip:
        return [0.0] * settings.embedding_dimensions

    candidates = [settings.embedding_model, settings.embedding_model_fallback]
    for model_id in candidates:
        try:
            genai.configure(api_key=settings.google_api_key)
            result = genai.embed_content(
                model=model_id,
                content=content,
                task_type="retrieval_document",
            )
            if model_id != settings.embedding_model:
                logger.info("embed.fallback_used", model=model_id)
            return result["embedding"]
        except Exception as exc:
            logger.debug("embed.model_failed", model=model_id, error=str(exc))
            continue

    logger.warning("embed.all_failed", fallback="zero_vector")
    return [0.0] * settings.embedding_dimensions


def _vec_str(vec: list[float]) -> str:
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"


# ---------------------------------------------------------------------------
# Policy chunk seeding — asyncpg with positional parameters
# ---------------------------------------------------------------------------

async def seed_policy_chunks(
    conn: asyncpg.Connection,
    chunks: list[PolicyChunkSeed],
    wipe: bool,
    skip_embeddings: bool,
) -> int:
    if wipe:
        await conn.execute("DELETE FROM policy_chunks")
        logger.info("seed.policy_chunks.wiped")

    inserted = 0
    for chunk in chunks:
        # Skip duplicates unless wiping
        existing = await conn.fetchval(
            "SELECT id FROM policy_chunks WHERE payer_id=$1 AND plan_type=$2 AND chunk_index=$3",
            chunk.payer_id, chunk.plan_type, chunk.chunk_index,
        )
        if existing and not wipe:
            logger.info("seed.policy_chunks.skip_duplicate",
                        payer=chunk.payer_id, idx=chunk.chunk_index)
            continue

        embedding = _embed_with_fallback(chunk.content, skip=skip_embeddings)
        vec_str = _vec_str(embedding)

        # Positional parameters with explicit PostgreSQL type casts.
        # $10::vector and $11::jsonb are safe with asyncpg positional-only syntax.
        await conn.execute(
            """
            INSERT INTO policy_chunks
                (id, payer_id, plan_type, cpt_codes, icd10_codes, source_doc,
                 page_num, chunk_index, content, embedding, metadata)
            VALUES
                ($1, $2, $3, $4, $5, $6,
                 $7, $8, $9, $10::vector, $11::jsonb)
            """,
            str(uuid.uuid4()),           # $1  id
            chunk.payer_id,              # $2  payer_id
            chunk.plan_type,             # $3  plan_type
            chunk.cpt_codes,             # $4  cpt_codes  (list → text[])
            chunk.icd10_codes,           # $5  icd10_codes
            chunk.source_doc,            # $6  source_doc
            chunk.page_num,              # $7  page_num
            chunk.chunk_index,           # $8  chunk_index
            chunk.content,               # $9  content
            vec_str,                     # $10 embedding::vector
            json.dumps(chunk.metadata),  # $11 metadata::jsonb
        )
        inserted += 1
        logger.info(
            "seed.policy_chunks.inserted",
            payer=chunk.payer_id,
            plan=chunk.plan_type,
            cpt=chunk.cpt_codes,
            idx=chunk.chunk_index,
        )

    return inserted


# ---------------------------------------------------------------------------
# Demo case seeding — asyncpg with positional parameters
# ---------------------------------------------------------------------------

async def seed_demo_cases(conn: asyncpg.Connection, wipe: bool) -> int:
    if wipe:
        await conn.execute("DELETE FROM demo_cases")
        logger.info("seed.demo_cases.wiped")

    inserted = 0
    for case in DEMO_CASE_OPTIONS:
        existing = await conn.fetchval(
            "SELECT id FROM demo_cases WHERE case_id=$1",
            case.case_id,
        )
        if existing and not wipe:
            logger.info("seed.demo_cases.skip_duplicate", case_id=case.case_id)
            continue

        order = ORDER_REQUESTS.get(case.case_id)
        order_data_json = json.dumps(order.model_dump(), default=str) if order else "{}"
        patient_data_json = json.dumps({"patient_id": order.patient_id} if order else {})

        await conn.execute(
            """
            INSERT INTO demo_cases
                (id, case_id, label, description, patient_data, order_data, scenario_tags)
            VALUES
                ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
            """,
            str(uuid.uuid4()),    # $1  id
            case.case_id,         # $2  case_id
            case.label,           # $3  label
            case.description,     # $4  description
            patient_data_json,    # $5  patient_data::jsonb
            order_data_json,      # $6  order_data::jsonb
            case.scenario_tags,   # $7  scenario_tags (list → text[])
        )
        inserted += 1
        logger.info("seed.demo_cases.inserted", case_id=case.case_id)

    return inserted


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def run(wipe: bool, skip_embeddings: bool) -> None:
    logger.info("seed.start", wipe=wipe, skip_embeddings=skip_embeddings)

    conn = await asyncpg.connect(_asyncpg_dsn())
    try:
        async with conn.transaction():
            n_chunks = await seed_policy_chunks(conn, POLICY_CHUNKS, wipe, skip_embeddings)
            n_cases = await seed_demo_cases(conn, wipe)
    finally:
        await conn.close()

    logger.info(
        "seed.complete",
        policy_chunks_inserted=n_chunks,
        demo_cases_inserted=n_cases,
    )
    emb_strategy = (
        "zero vectors (keyword fallback only — no embeddings)"
        if skip_embeddings else
        f"real embeddings ({settings.embedding_model}, fallback {settings.embedding_model_fallback})"
    )
    logger.info(
        "seed.summary",
        policy_chunks_inserted=n_chunks,
        total_policy_chunks=len(POLICY_CHUNKS),
        demo_cases_inserted=n_cases,
        total_demo_cases=len(DEMO_CASE_OPTIONS),
        embedding_strategy=emb_strategy,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed ClaimShield AI database")
    parser.add_argument("--wipe", action="store_true",
                        help="Delete existing rows before inserting")
    parser.add_argument("--skip-embeddings", action="store_true",
                        help="Insert zero-vector embeddings (no API key needed)")
    args = parser.parse_args()

    if not settings.google_api_key and not args.skip_embeddings:
        logger.error(
            "seed.no_api_key",
            hint="Set GOOGLE_API_KEY in .env or run with --skip-embeddings"
        )
        sys.exit(1)

    asyncio.run(run(wipe=args.wipe, skip_embeddings=args.skip_embeddings))


if __name__ == "__main__":
    main()
