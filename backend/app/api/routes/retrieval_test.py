"""
Internal demo and debugging endpoint. Remove or auth-gate before production deployment.

GET /api/v1/retrieval-test

Returns the top-5 payer policy chunks for a given payer, CPT code, and free-text
query, including cosine similarity scores, source labels (vector_search /
keyword_fallback), and Redis cache_hit status.

Useful for:
  - Verifying that seed embeddings are correct and retrievable
  - Confirming payer isolation (bcbs_tx never returns UHC/Aetna chunks)
  - Live demo of the RAG retrieval layer during judging
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.session import get_db
from app.services.retrieval import retrieve_policy_chunks

logger = get_logger(__name__)
router = APIRouter(tags=["retrieval-test"])

# Known payer → plan_type mapping for the demo corpus.
# In production this would be looked up from the payer registry.
_PAYER_PLAN_MAP: dict[str, str] = {
    "bcbs_tx":          "commercial",
    "unitedhealthcare": "commercial_hmo",
    "aetna":            "commercial",
}


@router.get("/retrieval-test")
async def retrieval_test(
    payer_name: str = Query(..., description="Payer ID, e.g. bcbs_tx | unitedhealthcare | aetna"),
    cpt_code:   str = Query(..., description="CPT code, e.g. 75571"),
    query:      str = Query(..., description="Free-text clinical query to embed and search"),
    top_k:      int = Query(5,  ge=1, le=10, description="Number of chunks to return"),
    db: AsyncSession = Depends(get_db),
):
    """
    Live retrieval test — embeds the query and runs cosine similarity against
    pgvector, then returns the top chunks with metadata.

    All results are scoped to the specified payer (hard SQL filter).
    Cache status (cache_hit) reflects whether Redis served this result.
    """
    plan_type = _PAYER_PLAN_MAP.get(payer_name.lower())
    if plan_type is None:
        known = list(_PAYER_PLAN_MAP.keys())
        return {
            "error": f"Unknown payer '{payer_name}'. Known payers: {known}",
            "cache_hit": False,
            "chunks": [],
        }

    logger.info(
        "retrieval_test.request",
        payer=payer_name,
        cpt=cpt_code,
        query_preview=query[:80],
    )

    result = await retrieve_policy_chunks(
        db=db,
        payer_id=payer_name.lower(),
        plan_type=plan_type,
        cpt_code=cpt_code,
        query_text=query,
        top_k=top_k,
    )

    return {
        "payer_id":           result.payer_id,
        "plan_type":          result.plan_type,
        "cpt_code":           result.cpt_code,
        "retrieval_strategy": result.retrieval_strategy,
        "cache_hit":          result.cache_hit,
        "total_retrieved":    result.total_retrieved,
        "chunks": [
            {
                "chunk_id":         c.chunk_id,
                "source_doc":       c.source_doc,
                "chunk_index":      None,   # not stored on PolicyChunk; use source_doc for ordering
                "similarity_score": round(c.similarity_score, 4),
                "source":           c.source,
                "content_preview":  c.content[:200] + ("…" if len(c.content) > 200 else ""),
                "content":          c.content,
                "cpt_codes":        c.cpt_codes,
                "icd10_codes":      c.icd10_codes,
            }
            for c in result.chunks
        ],
    }
