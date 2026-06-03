"""
POST /api/v1/process-order

Runs the 5-step prior auth workflow (detect → retrieve → analyze → draft → score)
and streams progress as Server-Sent Events (SSE).

SSE event format:
  data: {"event": "step_update", "current_state": "<step>", "status": "running|complete|error", "data": {...}}
  data: {"event": "complete", "run_id": "...", "result": { ...full workflow state... }}
  data: {"event": "error",    "run_id": "...", "message": "..."}

Each event is a single-line JSON followed by two newlines (SSE spec).
The final "complete" event carries the full WorkflowResult in its "result" field.

Human-in-the-loop guarantee:
  This endpoint NEVER auto-submits anything to a payer.
  All outputs (gap analysis, draft letter, score) are drafts for staff review.
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import datetime
from typing import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.workflow import run_workflow
from app.db.session import get_db
from app.models.schemas import (
    ProcessOrderRequest, OrderRequest, ErrorResponse,
)

logger = get_logger(__name__)

router = APIRouter(tags=["orders"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sse(payload: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(payload, default=str)}\n\n"


def _state_to_result(state: dict) -> dict:
    """
    Serialise the workflow state into the final API result object.
    Drops runtime-only fields (db_session, sse_queue).
    """
    return {
        "run_id":               state.get("run_id"),
        "completed":            state.get("completed", False),
        "step_statuses":        state.get("step_statuses", {}),
        "errors":               state.get("errors", {}),
        "pa_requirement":       state.get("pa_requirement"),
        "pa_criteria":          state.get("pa_criteria", []),
        "pa_not_required":      state.get("pa_not_required", False),
        "policy_retrieval":     _strip_heavy(state.get("policy_retrieval")),
        "gap_analysis":         state.get("gap_analysis"),
        "code_mismatch_warning": state.get("code_mismatch_warning"),
        "draft":                state.get("draft"),
        "patient_impact":       state.get("patient_impact"),
        "scoring":              state.get("scoring"),
        "patient":              state.get("patient"),
    }


def _strip_heavy(retrieval: dict | None) -> dict | None:
    """Remove full chunk content from policy_retrieval to keep SSE event size sane."""
    if not retrieval:
        return retrieval
    stripped = dict(retrieval)
    stripped["chunks"] = [
        {k: v for k, v in c.items() if k != "content"}
        for c in retrieval.get("chunks", [])
    ]
    return stripped


# ---------------------------------------------------------------------------
# POST /api/v1/process-order  (SSE streaming)
# ---------------------------------------------------------------------------

@router.post(
    "/process-order",
    summary="Run prior auth workflow — streams SSE progress events",
    responses={422: {"model": ErrorResponse}},
)
async def process_order(
    request: ProcessOrderRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Accept an OrderRequest and run the 5-step prior auth workflow.

    Returns a StreamingResponse (text/event-stream) with one SSE event per
    workflow step, followed by a final "complete" event containing the full
    result.  Never returns a 500 — errors are serialised into the SSE stream.

    Human-in-the-loop: no output is auto-submitted. All content is for staff
    review before any payer interaction.
    """
    run_id = str(uuid.uuid4())
    order_dict = request.order.model_dump(mode="json")
    started_at = time.time()

    logger.info(
        "process_order.start",
        run_id=run_id,
        patient_id=order_dict.get("patient_id"),
        payer_id=order_dict.get("payer_id"),
        cpt_code=order_dict.get("cpt_code"),
    )

    sse_queue: asyncio.Queue = asyncio.Queue(maxsize=50)

    async def _workflow_task() -> None:
        try:
            await run_workflow(
                order=order_dict,
                db=db,
                run_id=run_id,
                sse_queue=sse_queue,
            )
        except Exception as exc:
            logger.error("process_order.workflow_fatal", run_id=run_id, error=str(exc), exc_info=True)
        finally:
            await sse_queue.put(None)   # sentinel — signals generator to stop

    async def event_generator() -> AsyncGenerator[str, None]:
        # Yield an immediate "started" event so the client knows the stream is live
        yield _sse({
            "event": "started",
            "run_id": run_id,
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Start the workflow concurrently
        task = asyncio.create_task(_workflow_task())

        # Drain the SSE queue until the sentinel None is received
        while True:
            try:
                event = await asyncio.wait_for(sse_queue.get(), timeout=120.0)
            except asyncio.TimeoutError:
                yield _sse({"event": "heartbeat", "run_id": run_id})
                continue

            if event is None:
                break

            if event.get("event") == "step_update":
                yield _sse(event)

        # Await the task to get the final state (it has already completed)
        await task

        # Re-run the workflow without SSE to get the final state
        # (We need the final state — the task modified state internally but
        #  we only get back step events. Run a second pass? No — instead,
        #  store the state in a shared list from the task.)
        # NOTE: pattern above doesn't return state. Fix: use a result holder.
        # This is handled below via a different pattern.

    # -----------------------------------------------------------------------
    # Revised approach: collect state in a mutable holder, then stream result
    # -----------------------------------------------------------------------

    async def event_generator_v2() -> AsyncGenerator[str, None]:
        result_holder: list[dict] = []
        error_holder:  list[str]  = []

        yield _sse({
            "event": "started",
            "run_id": run_id,
            "timestamp": datetime.utcnow().isoformat(),
        })

        async def _run_and_store() -> None:
            try:
                final_state = await run_workflow(
                    order=order_dict,
                    db=db,
                    run_id=run_id,
                    sse_queue=sse_queue,
                )
                result_holder.append(final_state)
            except asyncio.CancelledError:
                # Client disconnected mid-stream — clean exit, no zombie coroutines
                logger.info("process_order.client_disconnected", run_id=run_id)
            except Exception as exc:
                error_holder.append(str(exc))
            finally:
                # Always unblock the queue reader
                try:
                    sse_queue.put_nowait(None)
                except asyncio.QueueFull:
                    pass

        task = asyncio.create_task(_run_and_store())

        try:
            while True:
                try:
                    event = await asyncio.wait_for(sse_queue.get(), timeout=120.0)
                except asyncio.TimeoutError:
                    yield _sse({"event": "heartbeat", "run_id": run_id})
                    continue

                if event is None:
                    break

                yield _sse(event)
        except asyncio.CancelledError:
            # Browser tab closed — cancel the workflow task to prevent zombie coroutines
            logger.info("process_order.sse_cancelled", run_id=run_id)
            task.cancel()
            return

        await task

        elapsed_ms = int((time.time() - started_at) * 1000)

        if error_holder:
            yield _sse({
                "event": "error",
                "run_id": run_id,
                "message": error_holder[0],
                "elapsed_ms": elapsed_ms,
            })
            return

        final_state = result_holder[0] if result_holder else {}
        result = _state_to_result(final_state)

        logger.info(
            "process_order.complete",
            run_id=run_id,
            elapsed_ms=elapsed_ms,
            errors=list(final_state.get("errors", {}).keys()),
        )

        yield _sse({
            "event": "complete",
            "run_id": run_id,
            "elapsed_ms": elapsed_ms,
            "result": result,
        })

    return StreamingResponse(
        event_generator_v2(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":  "no-cache",
            "X-Accel-Buffering": "no",   # disable Nginx buffering for SSE
        },
    )


# ---------------------------------------------------------------------------
# POST /api/v1/process-order/sync  (blocking — for testing and CLI use)
# ---------------------------------------------------------------------------

@router.post(
    "/process-order/sync",
    summary="Run prior auth workflow — blocking JSON response (no SSE)",
    responses={422: {"model": ErrorResponse}},
)
async def process_order_sync(
    request: ProcessOrderRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Same workflow as /process-order but returns a single JSON response after
    all steps complete.  Useful for testing, CLI scripts, and CI assertions.
    No SSE streaming.
    """
    run_id = str(uuid.uuid4())
    order_dict = request.order.model_dump(mode="json")
    started_at = time.time()

    logger.info(
        "process_order_sync.start",
        run_id=run_id,
        patient_id=order_dict.get("patient_id"),
    )

    try:
        final_state = await run_workflow(
            order=order_dict,
            db=db,
            run_id=run_id,
            sse_queue=None,
        )
    except Exception as exc:
        logger.error("process_order_sync.fatal", run_id=run_id, error=str(exc), exc_info=True)
        return {
            "run_id": run_id,
            "status": "error",
            "error": str(exc),
            "result": None,
            "elapsed_ms": int((time.time() - started_at) * 1000),
        }

    elapsed_ms = int((time.time() - started_at) * 1000)

    return {
        "run_id": run_id,
        "status": "complete" if not final_state.get("errors") else "partial",
        "elapsed_ms": elapsed_ms,
        "result": _state_to_result(final_state),
    }
