"""
Redis cache service.

Approved uses in ClaimShield AI:
  1. Policy chunk cache — key: policy_chunks:{payer_id}:{cpt_code}
     TTL: 24 hours (policy_chunk_cache_ttl_seconds)
     plan_type is intentionally excluded from the key; a payer+CPT pair maps
     to one active plan type in the demo corpus.
  2. Workflow state cache — key: workflow:{run_id}
     TTL: 24 hours (workflow_state_ttl_seconds)
  3. Rate limiting / job status — key: ratelimit:{client_ip} / job:{run_id}

Redis is NOT the vector store. All vector similarity search goes through
pgvector in Postgres via services/retrieval.py.
"""
from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

_redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


# ---------------------------------------------------------------------------
# 1. Policy chunk cache
# ---------------------------------------------------------------------------

def _policy_key(payer_id: str, cpt_code: str) -> str:
    return f"policy_chunks:{payer_id}:{cpt_code}"


async def get_cached_policy_chunks(
    payer_id: str,
    cpt_code: str,
) -> Any | None:
    """Return cached policy retrieval result dict, or None on miss/error."""
    try:
        r = await get_redis()
        raw = await r.get(_policy_key(payer_id, cpt_code))
        if raw:
            logger.debug("cache.policy_chunks.hit", payer_id=payer_id, cpt_code=cpt_code)
            return json.loads(raw)
        logger.debug("cache.policy_chunks.miss", payer_id=payer_id, cpt_code=cpt_code)
        return None
    except Exception as exc:
        logger.warning("cache.policy_chunks.get_error", error=str(exc))
        return None


async def set_cached_policy_chunks(
    payer_id: str,
    cpt_code: str,
    data: Any,
) -> None:
    """Cache policy retrieval result for 24 hours. Silently swallows errors."""
    try:
        r = await get_redis()
        await r.setex(
            _policy_key(payer_id, cpt_code),
            settings.policy_chunk_cache_ttl_seconds,
            json.dumps(data),
        )
        logger.debug("cache.policy_chunks.set", payer_id=payer_id, cpt_code=cpt_code)
    except Exception as exc:
        logger.warning("cache.policy_chunks.set_error", error=str(exc))


# ---------------------------------------------------------------------------
# 2. Workflow state cache
# ---------------------------------------------------------------------------

def _workflow_key(run_id: str) -> str:
    return f"workflow:{run_id}"


async def get_workflow_state(run_id: str) -> dict[str, Any] | None:
    """Return cached workflow state dict, or None on miss/error."""
    try:
        r = await get_redis()
        raw = await r.get(_workflow_key(run_id))
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning("cache.workflow_state.get_error", run_id=run_id, error=str(exc))
        return None


async def set_workflow_state(run_id: str, state: dict[str, Any]) -> None:
    """Persist workflow state for 24 hours. Silently swallows errors."""
    try:
        r = await get_redis()
        await r.setex(
            _workflow_key(run_id),
            settings.workflow_state_ttl_seconds,
            json.dumps(state, default=str),
        )
    except Exception as exc:
        logger.warning("cache.workflow_state.set_error", run_id=run_id, error=str(exc))


# ---------------------------------------------------------------------------
# 3. Rate limiting
# ---------------------------------------------------------------------------

def _rate_key(client_id: str) -> str:
    return f"ratelimit:{client_id}"


async def check_rate_limit(client_id: str) -> tuple[bool, int]:
    """
    Sliding-window rate limiter.
    Returns (allowed: bool, requests_remaining: int).
    Falls back to allowing the request if Redis is unavailable.
    """
    try:
        r = await get_redis()
        key = _rate_key(client_id)
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, settings.rate_limit_window_seconds)
        results = await pipe.execute()
        count = int(results[0])
        allowed = count <= settings.rate_limit_max_requests
        remaining = max(0, settings.rate_limit_max_requests - count)
        return allowed, remaining
    except Exception as exc:
        logger.warning("cache.rate_limit.error", error=str(exc))
        return True, settings.rate_limit_max_requests


# ---------------------------------------------------------------------------
# 4. Job status tracking
# ---------------------------------------------------------------------------

def _job_key(run_id: str) -> str:
    return f"job:{run_id}"


async def set_job_status(run_id: str, status: str, detail: str | None = None) -> None:
    """Record job status with 24h TTL. Used for polling endpoints."""
    try:
        r = await get_redis()
        payload = json.dumps({"status": status, "detail": detail})
        await r.setex(_job_key(run_id), settings.workflow_state_ttl_seconds, payload)
    except Exception as exc:
        logger.warning("cache.job_status.set_error", run_id=run_id, error=str(exc))


async def get_job_status(run_id: str) -> dict[str, Any] | None:
    """Retrieve job status. Returns None if not found or Redis unavailable."""
    try:
        r = await get_redis()
        raw = await r.get(_job_key(run_id))
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning("cache.job_status.get_error", run_id=run_id, error=str(exc))
        return None
