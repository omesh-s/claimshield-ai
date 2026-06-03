"""
LLM service — single seam for all Gemini calls.
All generation and embedding calls route through this module.

Timeout policy: every Gemini call has a hard 30s timeout enforced via
asyncio.wait_for(asyncio.to_thread(...)).  On timeout or rate-limit, the
call is retried exactly once before re-raising.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_LLM_TIMEOUT_SECONDS = 30  # hard timeout per Gemini call

# Configure SDK once at import time — use settings via get_settings() to pick
# up any config changes without requiring a full module reload.
def _configure_sdk() -> None:
    genai.configure(api_key=get_settings().google_api_key)

_configure_sdk()

_safety_settings = [
    {"category": "HARM_CATEGORY_HARASSMENT",        "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH",       "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]


def _get_model(json_mode: bool = True) -> genai.GenerativeModel:
    """Build a Gemini model instance using live settings (temperature always 0.0)."""
    cfg = get_settings()
    generation_config = genai.types.GenerationConfig(
        temperature=cfg.llm_temperature,   # must be 0.0 — see config.py default
        max_output_tokens=cfg.llm_max_tokens,
        **({"response_mime_type": "application/json"} if json_mode else {}),
    )
    return genai.GenerativeModel(
        model_name=cfg.gemini_model,
        generation_config=generation_config,
        safety_settings=_safety_settings,
    )


def _extract_json(text: str) -> Any:
    """Strip markdown code fences and parse JSON from LLM output."""
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def _is_retriable(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(k in msg for k in ("timeout", "rate", "429", "503", "resource exhausted"))


async def _call_with_retry(blocking_fn, timeout: float = _LLM_TIMEOUT_SECONDS) -> Any:
    """
    Run a blocking SDK call in a thread pool with timeout.
    Retries once on timeout or rate-limit errors.
    """
    for attempt in range(2):
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(blocking_fn),
                timeout=timeout,
            )
        except (asyncio.TimeoutError, Exception) as exc:
            is_last = (attempt == 1)
            if is_last or not _is_retriable(exc):
                raise
            wait = 3 if isinstance(exc, asyncio.TimeoutError) else 5
            logger.warning(
                "llm.call_retry",
                attempt=attempt + 1,
                error=str(exc)[:120],
                wait_s=wait,
            )
            await asyncio.sleep(wait)
    raise RuntimeError("LLM call failed after retry — should not reach here")


async def generate_json(prompt: str, context: str = "") -> dict[str, Any]:
    """
    Call Gemini with JSON response mode and return a parsed dict.
    30s timeout; retries once on timeout/rate-limit.
    """
    full_prompt = f"{context}\n\n{prompt}" if context else prompt
    model = _get_model(json_mode=True)

    logger.debug("llm.generate_json", prompt_len=len(full_prompt))

    def _call():
        return model.generate_content(full_prompt)

    response = await _call_with_retry(_call)
    text = response.text

    # Log token usage for cost tracking (Section 2: token optimization)
    usage = getattr(response, "usage_metadata", None)
    if usage:
        logger.info(
            "llm.token_usage",
            call_type="generate_json",
            model=get_settings().gemini_model,
            input_tokens=getattr(usage, "prompt_token_count", None),
            output_tokens=getattr(usage, "candidates_token_count", None),
            total_tokens=getattr(usage, "total_token_count", None),
        )

    try:
        result = _extract_json(text)
        logger.debug(
            "llm.generate_json.success",
            response_keys=list(result.keys()) if isinstance(result, dict) else type(result).__name__,
        )
        return result
    except json.JSONDecodeError as exc:
        logger.error("llm.generate_json.parse_error", raw=text[:500], error=str(exc))
        raise ValueError(f"LLM returned non-JSON output: {text[:200]}") from exc


async def generate_text(prompt: str, context: str = "") -> str:
    """
    Call Gemini and return raw text (for letter drafts).
    30s timeout; retries once on timeout/rate-limit.
    """
    full_prompt = f"{context}\n\n{prompt}" if context else prompt
    model = _get_model(json_mode=False)

    logger.debug("llm.generate_text", prompt_len=len(full_prompt))

    def _call():
        return model.generate_content(full_prompt)

    response = await _call_with_retry(_call)

    usage = getattr(response, "usage_metadata", None)
    if usage:
        logger.info(
            "llm.token_usage",
            call_type="generate_text",
            model=get_settings().gemini_model,
            input_tokens=getattr(usage, "prompt_token_count", None),
            output_tokens=getattr(usage, "candidates_token_count", None),
            total_tokens=getattr(usage, "total_token_count", None),
        )

    return response.text


def _embed_with_fallback(content: str, task_type: str) -> list[float]:
    """
    Call genai.embed_content with automatic model fallback.
    Confirmed working models (google-generativeai 0.7.2):
      models/gemini-embedding-001  (primary,  3072 dims)
      models/gemini-embedding-2    (fallback, 3072 dims)
    """
    cfg = get_settings()
    candidates = [cfg.embedding_model, cfg.embedding_model_fallback]
    last_exc: Exception | None = None
    for model_id in candidates:
        try:
            result = genai.embed_content(
                model=model_id,
                content=content,
                task_type=task_type,
            )
            if model_id != cfg.embedding_model:
                logger.info("llm.embed.fallback_used", model=model_id)
            return result["embedding"]
        except Exception as exc:
            last_exc = exc
            logger.debug("llm.embed.model_failed", model=model_id, error=str(exc))
            continue
    raise RuntimeError(
        f"All embedding models failed. Last error: {last_exc}"
    ) from last_exc


async def embed_text(content: str) -> list[float]:
    """Embed a document string for indexing (3072 dims)."""
    logger.debug("llm.embed_text", text_len=len(content))
    return await asyncio.to_thread(_embed_with_fallback, content, "retrieval_document")


async def embed_query(query: str) -> list[float]:
    """Embed a retrieval query — retrieval_query task type improves recall."""
    logger.debug("llm.embed_query", query_len=len(query))
    return await asyncio.to_thread(_embed_with_fallback, query, "retrieval_query")
