"""
Retrieval service — pgvector-backed payer policy search with Redis caching.

Vector store  : pgvector on Postgres (policy_chunks table), vector(3072)
Cache layer   : Redis with 24h TTL, key: policy_chunks:{payer_id}:{cpt_code}
Fallback      : Postgres tsvector full-text search when < 2 vector results
                exceed the similarity threshold of 0.5.

Payer isolation guarantee:
  All queries include a hard WHERE payer_id = :payer_id filter.
  A query for bcbs_tx will never return chunks from unitedhealthcare or aetna.

Dimension note:
  Embeddings are produced by models/gemini-embedding-001 (3072 dims).
  pgvector's ivfflat/hnsw indexes cap at 2000 dims in this build, so no
  vector index exists — sequential cosine scan is used instead.
  For the 9-chunk demo corpus this is effectively instant (<1 ms).
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.schemas import PolicyChunk, PolicyRetrievalResult
from app.services.llm import embed_query
from app.services.cache import get_cached_policy_chunks, set_cached_policy_chunks

logger = get_logger(__name__)
settings = get_settings()

# Results with cosine similarity below this threshold are considered weak.
# If fewer than MIN_STRONG_RESULTS exceed the threshold, keyword fallback runs.
_SIMILARITY_THRESHOLD: float = 0.50
_MIN_STRONG_RESULTS: int = 2


async def retrieve_policy_chunks(
    db: AsyncSession,
    payer_id: str,
    plan_type: str,
    cpt_code: str,
    query_text: str,
    top_k: int | None = None,
) -> PolicyRetrievalResult:
    """
    Return the most relevant payer policy chunks for a prior auth query.

    Flow:
      1. Check Redis cache (key: policy_chunks:{payer_id}:{cpt_code}).
         On hit → return immediately with cache_hit=True.
      2. Embed query_text via gemini-embedding-001 (3072 dims).
      3. Run cosine similarity scan against policy_chunks filtered by
         payer_id AND plan_type AND cpt_code. Payer isolation is enforced
         at the SQL level — no cross-payer leakage is possible.
      4. If fewer than 2 results score >= 0.50, run tsvector keyword fallback.
      5. Write result to Redis (24h TTL) then return.

    Args:
        payer_id:    Payer identifier, e.g. "bcbs_tx". Used as hard SQL filter.
        plan_type:   Plan type, e.g. "commercial". Used as hard SQL filter.
        cpt_code:    Primary CPT code, e.g. "75571". Used as hard SQL filter.
        query_text:  Free-text query to embed and compare against chunk embeddings.
        top_k:       Max chunks to return (defaults to settings.retrieval_top_k = 6).
    """
    k = top_k or settings.retrieval_top_k

    # --- Redis cache check ---------------------------------------------------
    cached = await get_cached_policy_chunks(payer_id, cpt_code)
    if cached:
        try:
            result = PolicyRetrievalResult(**cached)
            # Ensure cache_hit is propagated even if the cached object predates
            # the field addition.
            result = result.model_copy(update={"cache_hit": True})
            logger.info(
                "retrieval.cache_hit",
                payer_id=payer_id,
                cpt_code=cpt_code,
                chunks=result.total_retrieved,
            )
            return result
        except Exception as exc:
            logger.warning("retrieval.cache_deserialize_error", error=str(exc))

    # --- Embed query (3072 dims) ---------------------------------------------
    query_embedding = await embed_query(query_text)
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    # --- Vector cosine scan --------------------------------------------------
    # Hard filters on payer_id + plan_type prevent any cross-payer chunk leakage.
    # The threshold is NOT applied in SQL so we always get top_k candidates and
    # decide in Python whether to trigger the keyword fallback.
    # Use CAST(... AS vector) instead of ::vector — SQLAlchemy text() with asyncpg
    # interprets `:name::type` ambiguously and strips the `<=>` operator.
    vector_sql = text("""
        SELECT
            id::text                                          AS chunk_id,
            payer_id,
            plan_type,
            source_doc,
            page_num,
            content,
            cpt_codes,
            icd10_codes,
            1 - (embedding <=> CAST(:embedding AS vector))    AS similarity_score
        FROM  policy_chunks
        WHERE payer_id  = :payer_id
          AND plan_type = :plan_type
          AND (
              array_length(cpt_codes, 1) IS NULL
              OR :cpt_code = ANY(cpt_codes)
          )
        ORDER BY similarity_score DESC
        LIMIT :k
    """)

    rows = (await db.execute(
        vector_sql,
        {
            "embedding": embedding_str,
            "payer_id":  payer_id,
            "plan_type": plan_type,
            "cpt_code":  cpt_code,
            "k":         k,
        },
    )).mappings().all()

    # Count results that clear the similarity threshold
    strong_rows = [r for r in rows if float(r["similarity_score"]) >= _SIMILARITY_THRESHOLD]

    logger.info(
        "retrieval.vector_scan",
        payer_id=payer_id,
        cpt_code=cpt_code,
        total_rows=len(rows),
        strong_rows=len(strong_rows),
        threshold=_SIMILARITY_THRESHOLD,
    )

    if len(strong_rows) >= _MIN_STRONG_RESULTS:
        # Happy path — enough high-quality vector results
        chunks = _build_chunks(rows, source="vector_search")
        strategy = "vector_search"
    else:
        # Fallback — too few strong vector hits; use tsvector full-text search
        logger.warning(
            "retrieval.keyword_fallback_triggered",
            payer_id=payer_id,
            cpt_code=cpt_code,
            strong_rows=len(strong_rows),
        )
        fallback_rows = await _keyword_fallback(db, payer_id, plan_type, cpt_code, k)
        chunks = _build_chunks(fallback_rows, source="keyword_fallback")
        strategy = "keyword_fallback"

    result = PolicyRetrievalResult(
        payer_id=payer_id,
        plan_type=plan_type,
        cpt_code=cpt_code,
        chunks=chunks,
        total_retrieved=len(chunks),
        retrieval_strategy=strategy,
        cache_hit=False,
    )

    # Write to Redis cache (24h TTL) — pgvector remains the source of truth
    await set_cached_policy_chunks(payer_id, cpt_code, result.model_dump(mode="json"))

    return result


def _build_chunks(rows: list, source: str) -> list[PolicyChunk]:
    """Convert SQL row mappings to PolicyChunk models with the given source label."""
    return [
        PolicyChunk(
            chunk_id=str(row["chunk_id"]),
            payer_id=row["payer_id"],
            plan_type=row["plan_type"],
            source_doc=row["source_doc"],
            page_num=row.get("page_num"),
            content=row["content"],
            similarity_score=float(row["similarity_score"]),
            cpt_codes=list(row["cpt_codes"] or []),
            icd10_codes=list(row["icd10_codes"] or []),
            source=source,
        )
        for row in rows
    ]


async def _keyword_fallback(
    db: AsyncSession,
    payer_id: str,
    plan_type: str,
    cpt_code: str,
    k: int,
) -> list:
    """
    Postgres tsvector full-text search fallback.
    Triggered when vector similarity returns fewer than 2 results above 0.50.
    Ranks chunks by ts_rank against the CPT code and clinical keywords.
    Results receive similarity_score=0.0 (no vector score available).
    """
    sql = text("""
        SELECT
            id::text        AS chunk_id,
            payer_id,
            plan_type,
            source_doc,
            page_num,
            content,
            cpt_codes,
            icd10_codes,
            0.0             AS similarity_score
        FROM  policy_chunks
        WHERE payer_id   = :payer_id
          AND plan_type  = :plan_type
          AND (
              to_tsvector('english', content) @@ plainto_tsquery('english', :query_terms)
              OR :cpt_code = ANY(cpt_codes)
          )
        ORDER BY
            ts_rank(to_tsvector('english', content),
                    plainto_tsquery('english', :query_terms)) DESC,
            created_at DESC
        LIMIT :k
    """)

    query_terms = f"prior authorization {cpt_code} documentation"

    rows = (await db.execute(
        sql,
        {
            "payer_id":    payer_id,
            "plan_type":   plan_type,
            "cpt_code":    cpt_code,
            "query_terms": query_terms,
            "k":           k,
        },
    )).mappings().all()

    return list(rows)
