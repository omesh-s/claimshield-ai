"""
Admin endpoints for hackathon demo management.

All endpoints require the X-Admin-Key header matching ADMIN_API_KEY in .env.

POST /admin/reseed        — re-register mock data (note: DB re-seeding requires CLI)
POST /admin/clear-cache   — flush Redis policy chunk cache
GET  /admin/status        — detailed system status (DB, Redis, models)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from typing import Annotated

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.startup import register_all_mocks
from app.services.cache import get_redis

logger = get_logger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin_key(x_admin_key: Annotated[str | None, Header()] = None) -> None:
    """Dependency: validates X-Admin-Key header against ADMIN_API_KEY setting."""
    if not x_admin_key or x_admin_key != get_settings().admin_api_key:
        logger.warning("admin.unauthorized_attempt")
        raise HTTPException(status_code=403, detail="Forbidden — valid X-Admin-Key required.")


class ReseedResponse(BaseModel):
    status: str
    mocks_registered: bool
    message: str
    note: str


class ClearCacheResponse(BaseModel):
    status: str
    keys_deleted: int
    message: str


class SystemStatusResponse(BaseModel):
    redis_connected: bool
    redis_info: str
    llm_model: str
    embedding_model: str
    embedding_model_fallback: str
    embedding_dimensions: int
    api_prefix: str
    environment: str
    app_version: str


@router.post("/reseed", response_model=ReseedResponse, dependencies=[Depends(_require_admin_key)])
async def reseed_demo_data() -> ReseedResponse:
    """
    Re-register all mock EHR / clearinghouse data in memory.

    Note: Re-embedding and reinserting policy chunks into pgvector requires
    running `python -m app.ingestion.seed --wipe` from the CLI (takes ~2 min
    due to Gemini API rate limits). This endpoint refreshes only the in-memory
    mocks, which is sufficient for demo reliability.
    """
    try:
        register_all_mocks()
        logger.info("admin.reseed.complete")
        return ReseedResponse(
            status="ok",
            mocks_registered=True,
            message="In-memory mock data re-registered successfully.",
            note=(
                "pgvector policy chunks were NOT re-embedded. To re-seed the database "
                "run: python -m app.ingestion.seed --wipe from the backend directory."
            ),
        )
    except Exception as exc:
        logger.error("admin.reseed.error", error=str(exc))
        return ReseedResponse(
            status="error",
            mocks_registered=False,
            message=f"Reseed failed: {str(exc)}",
            note="Check server logs for details.",
        )


@router.post("/clear-cache", response_model=ClearCacheResponse, dependencies=[Depends(_require_admin_key)])
async def clear_policy_cache() -> ClearCacheResponse:
    """
    Flush all Redis policy chunk cache entries (policy_chunks:* keys).

    After clearing, the next retrieval request for each payer/CPT combination
    will hit pgvector and repopulate the cache.
    """
    try:
        redis = await get_redis()
        deleted = 0
        async for key in redis.scan_iter("policy_chunks:*"):
            await redis.delete(key)
            deleted += 1

        logger.info("admin.clear_cache.complete", keys_deleted=deleted)

        return ClearCacheResponse(
            status="ok",
            keys_deleted=deleted,
            message=f"Flushed {deleted} policy chunk cache entries.",
        )
    except Exception as exc:
        logger.error("admin.clear_cache.error", error=str(exc))
        return ClearCacheResponse(
            status="error",
            keys_deleted=0,
            message=f"Cache clear failed: {str(exc)}",
        )


@router.get("/status", response_model=SystemStatusResponse)
async def get_system_status() -> SystemStatusResponse:
    """
    Returns detailed system configuration status for the Settings page.
    """
    # Check Redis connectivity
    redis_connected = False
    redis_info = "Not connected"
    try:
        redis = await get_redis()
        if redis:
            await redis.ping()
            redis_connected = True
            redis_info = "Connected — localhost:6379"
    except Exception as exc:
        redis_info = f"Unavailable: {str(exc)[:60]}"

    cfg = get_settings()
    return SystemStatusResponse(
        redis_connected=redis_connected,
        redis_info=redis_info,
        llm_model=cfg.gemini_model,
        embedding_model=cfg.embedding_model,
        embedding_model_fallback=cfg.embedding_model_fallback,
        embedding_dimensions=cfg.embedding_dimensions,
        api_prefix=cfg.api_prefix,
        environment=cfg.environment,
        app_version=cfg.app_version,
    )
