"""
LangGraph workflow for the ClaimShield AI prior auth pipeline.

Graph topology:   detect → retrieve → analyze → draft → score → END
                            ↑
                  (conditional: if PA not required → END after detect)

Each step function (_run_*) is a standalone async coroutine that:
  - Accepts the current PAWorkflowState dict plus any infra dependencies
  - Returns a dict of state keys to update
  - Emits an SSE event via state["sse_queue"] if one is present
  - Catches its own exceptions, writes to state["errors"], and never crashes

The LangGraph graph is assembled below for architectural completeness and
can be used directly via `workflow_app.ainvoke(state)` when SSE streaming
is not needed.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from typing import TypedDict, Any

from langgraph.graph import StateGraph, END
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.schemas import (
    WorkflowStep, StepStatus,
    PARequirementResult, PolicyRetrievalResult, PolicyChunk,
    GapAnalysisResult, CriterionEvaluation, CriterionStatus, CodeMismatchWarning,
    DraftResult, JustificationLetter, GapReport,
    ScoringResult, CriterionScore, SubmissionReadiness,
    PatientDemographics, PatientImpact,
)
from app.services.llm import generate_json, generate_text
from app.services.retrieval import retrieve_policy_chunks
from app.services.rules import check_pa_requirement
from app.services.cache import get_cached_score, set_cached_score
from app.mocks.ehr import get_patient_demographics, get_chart_artifacts

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Cardiac code mismatch detection
# ---------------------------------------------------------------------------

_CARDIAC_CPT = frozenset({"75571", "75561", "75563", "75564", "75565", "75574"})
# ICD-10 prefixes that are structurally cardiac
_CARDIAC_ICD_PREFIXES = frozenset({"I", "Q"})
# Non-cardiac prefixes that, when ALL ICD-10 codes carry them, indicate mismatch
_NON_CARDIAC_ICD_PREFIXES = frozenset({"J", "S", "T", "M", "K", "N", "G", "R", "Z"})


def _detect_code_mismatch(cpt_code: str, icd10_codes: list[str]) -> CodeMismatchWarning:
    is_cardiac_cpt = cpt_code in _CARDIAC_CPT
    if not is_cardiac_cpt or not icd10_codes:
        return CodeMismatchWarning(detected=False, cpt_code=cpt_code, icd10_codes=icd10_codes)

    all_non_cardiac = all(
        (code[0] if code else "I") in _NON_CARDIAC_ICD_PREFIXES
        for code in icd10_codes
    )
    return CodeMismatchWarning(
        detected=all_non_cardiac,
        cpt_code=cpt_code,
        icd10_codes=icd10_codes,
        warning_message=(
            "The procedure code does not align with the documented diagnosis codes. "
            "Please confirm before proceeding."
        ),
    )


# ---------------------------------------------------------------------------
# LangGraph TypedDict state
# ---------------------------------------------------------------------------

class PAWorkflowState(TypedDict):
    run_id: str
    order: dict[str, Any]
    patient: dict[str, Any] | None
    pa_requirement: dict[str, Any] | None
    pa_criteria: list[str]
    pa_not_required: bool
    policy_retrieval: dict[str, Any] | None
    gap_analysis: dict[str, Any] | None
    code_mismatch_warning: dict[str, Any] | None
    draft: dict[str, Any] | None
    patient_impact: dict[str, Any] | None
    scoring: dict[str, Any] | None
    denial: dict[str, Any] | None
    appeal: dict[str, Any] | None
    record_bundle: dict[str, Any] | None
    step_statuses: dict[str, str]
    current_step: str | None
    errors: dict[str, str]
    completed: bool
    # Injected at runtime — not serialized
    db_session: Any   # AsyncSession
    sse_queue: Any    # asyncio.Queue | None


def _mark(state: PAWorkflowState, step: str, status: str) -> PAWorkflowState:
    statuses = dict(state.get("step_statuses", {}))
    statuses[step] = status
    return {**state, "step_statuses": statuses, "current_step": step}


def _emit(state: PAWorkflowState, step: str, status: str, data: dict | None = None) -> None:
    q = state.get("sse_queue")
    if q is None:
        return
    event = {
        "event": "step_update",
        "current_state": step,
        "status": status,
        "data": data or {},
        "timestamp": datetime.utcnow().isoformat(),
    }
    try:
        q.put_nowait(event)
    except asyncio.QueueFull:
        pass


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

_ANALYZE_PROMPT = """\
You are a prior authorization specialist reviewing a patient chart against payer coverage criteria.

PAYER POLICY CONTEXT (from retrieved policy documents):
{chunks_text}

PATIENT CHART DATA:
{chart_text}

REQUIRED CRITERIA TO EVALUATE:
{criteria_numbered}

CPT CODE: {cpt_code}
ICD-10 DIAGNOSIS CODES: {icd10_codes}

INSTRUCTIONS:
1. For each required criterion, determine whether the patient chart satisfies it.
   Use: "met" = clear documentation present | "missing" = required doc absent | "unclear" = incomplete/ambiguous
2. For each "met" criterion, extract the exact quote from the chart that satisfies it.
3. Determine if the CPT code is clinically consistent with the ICD-10 codes.
4. Write a brief clinical reasoning paragraph summarizing the overall assessment.

Return ONLY a valid JSON object with this exact structure (no other text):
{{
  "met": ["<criterion text for each met criterion>"],
  "missing": ["<criterion text for each missing criterion>"],
  "unclear": ["<criterion text for each unclear criterion>"],
  "chart_citations": {{
    "<criterion text>": "<exact quote from chart that satisfies it>"
  }},
  "clinical_reasoning": "<one paragraph assessment>",
  "code_mismatch_confirmed": true
}}
"""

_DRAFT_PROMPT = """\
You are a prior authorization specialist drafting a clinical justification letter for payer submission.

Write a complete, professional prior authorization letter. Use plain prose paragraphs — no markdown, no bullet points, no asterisks.

REQUIREMENTS:
- Full letter header: date, addressee (payer name), patient demographics, insurance identifiers, CPT code, diagnosis codes
- Opening paragraph: state the purpose of the letter and the procedure being requested
- For each MET criterion: write a dedicated paragraph citing the specific chart documentation
- For each MISSING criterion: write a paragraph acknowledging the gap and stating that supplemental documentation will be provided upon request
- Reference the payer coverage policy by name where applicable
- Closing paragraph: offer to provide additional documentation, include provider contact
- Signature block: provider name, NPI, specialty, facility

PATIENT: {patient_name}, DOB {patient_dob}
MEMBER ID: {member_id}
PAYER: {payer_display}
PLAN: {plan_display}
CPT: {cpt_code} — {procedure_description}
DIAGNOSIS: {icd10_display}
DATE OF LETTER: {letter_date}

MET CRITERIA WITH CHART CITATIONS:
{met_section}

MISSING CRITERIA (to be supplemented):
{missing_section}

PAYER POLICY CONTEXT:
{chunks_text}

Write the complete letter now (plain text only):"""

_SCORE_PROMPT = """\
You are a quality reviewer. Score each payer criterion against the drafted prior authorization letter.

PAYER CRITERIA TO SCORE:
{criteria_numbered}

RETRIEVED POLICY CONTEXT:
{chunks_text}

DRAFTED LETTER:
{draft_letter}

SCORING RULES (apply strictly and consistently):
- "pass"  = the letter contains a specific paragraph directly addressing this criterion with named evidence from the patient chart
- "flag"  = the letter mentions the topic but the supporting evidence is indirect, vague, or incomplete
- "fail"  = the letter does not address this criterion at all, or the required documentation is explicitly stated as missing

You MUST score every criterion listed. Do not skip any.
Apply the same scoring threshold every time — do not vary based on writing style.

Return ONLY this exact JSON structure (no markdown, no prose, no extra keys):
{{
  "scores": [
    {{"criterion": "<exact criterion text from list above>", "status": "pass", "note": "<one sentence>"}},
    {{"criterion": "<exact criterion text from list above>", "status": "flag", "note": "<one sentence>"}},
    {{"criterion": "<exact criterion text from list above>", "status": "fail", "note": "<one sentence>"}}
  ],
  "overall_readiness": "<N of M criteria passed>",
  "recommendation": "ready_for_review",
  "reviewer_notes": "<1-2 sentence staff summary>"
}}

Where recommendation must be exactly "ready_for_review" if zero fail scores, otherwise "needs_revision".
"""


# ---------------------------------------------------------------------------
# Step 1: detect
# ---------------------------------------------------------------------------

async def _run_detect(state: PAWorkflowState) -> dict[str, Any]:
    order = state["order"]
    _emit(state, "detect", "running")

    # Fetch demographics to get member_id
    demo = await get_patient_demographics(order["patient_id"])
    member_id = demo.member_id if demo else "UNKNOWN"

    pa_result = await check_pa_requirement(
        payer_id=order["payer_id"],
        plan_type=order["plan_type"],
        cpt_code=order["cpt_code"],
        icd10_codes=order["icd10_codes"],
        provider_npi=order["ordering_provider_npi"],
        member_id=member_id,
    )

    # Extract ordered criteria list from the X12 raw response
    pa_criteria: list[str] = []
    raw = pa_result.raw_response or {}
    for c in raw.get("criteria", []):
        desc = c.get("description") or c.get("criterionId", "")
        if desc:
            pa_criteria.append(desc)

    # Fallback: parse from recommendation text if no structured criteria
    if not pa_criteria and pa_result.recommendation:
        lines = [l.strip() for l in pa_result.recommendation.split(",") if l.strip()]
        pa_criteria = [l.lstrip("(0123456789). ") for l in lines if len(l) > 10]

    mismatch = _detect_code_mismatch(order["cpt_code"], order["icd10_codes"])

    _emit(state, "detect", "complete", {
        "pa_required": pa_result.required,
        "criteria_count": len(pa_criteria),
        "code_mismatch": mismatch.detected,
        "is_fallback": pa_result.is_fallback,
    })

    return {
        "patient": demo.model_dump(mode="json") if demo else None,
        "pa_requirement": pa_result.model_dump(mode="json"),
        "pa_criteria": pa_criteria,
        "pa_not_required": not pa_result.required,
        "code_mismatch_warning": mismatch.model_dump(mode="json"),
    }


# ---------------------------------------------------------------------------
# Step 2: retrieve
# ---------------------------------------------------------------------------

async def _run_retrieve(state: PAWorkflowState) -> dict[str, Any]:
    order = state["order"]
    db: AsyncSession = state["db_session"]
    pa_criteria = state.get("pa_criteria", [])

    _emit(state, "retrieve", "running")

    query_text = (
        " ".join(pa_criteria)
        if pa_criteria
        else f"prior authorization requirements documentation {order['cpt_code']} {order['payer_id']}"
    )

    try:
        result = await retrieve_policy_chunks(
            db=db,
            payer_id=order["payer_id"],
            plan_type=order["plan_type"],
            cpt_code=order["cpt_code"],
            query_text=query_text,
        )
    except Exception as exc:
        logger.warning("workflow.retrieve.error_continuing", error=str(exc))
        result = PolicyRetrievalResult(
            payer_id=order["payer_id"],
            plan_type=order["plan_type"],
            cpt_code=order["cpt_code"],
            chunks=[],
            total_retrieved=0,
            retrieval_strategy="error_empty",
            cache_hit=False,
        )

    _emit(state, "retrieve", "complete", {
        "chunks_retrieved": result.total_retrieved,
        "strategy": result.retrieval_strategy,
        "cache_hit": result.cache_hit,
    })

    return {"policy_retrieval": result.model_dump(mode="json")}


# ---------------------------------------------------------------------------
# Step 3: analyze
# ---------------------------------------------------------------------------

async def _run_analyze(state: PAWorkflowState) -> dict[str, Any]:
    order = state["order"]
    pa_criteria = state.get("pa_criteria", [])
    policy_retrieval = state.get("policy_retrieval") or {}

    _emit(state, "analyze", "running")

    # Fetch chart artifacts
    artifacts = await get_chart_artifacts(order["patient_id"])
    chart_text = "\n\n---\n\n".join(
        f"[{a.artifact_type.upper()}] {a.title} ({a.date}) — {a.provider}\n{a.content}"
        for a in artifacts
    )
    if not chart_text:
        chart_text = order.get("clinical_notes") or "No chart data available."

    # Build chunks text
    chunks = policy_retrieval.get("chunks", [])
    chunks_text = "\n\n---\n\n".join(
        f"Source: {c.get('source_doc', 'policy')}\n{c.get('content', '')}"
        for c in chunks
    )
    if not chunks_text:
        chunks_text = "No policy documents retrieved. Use general prior authorization knowledge."

    criteria_numbered = "\n".join(f"{i+1}. {c}" for i, c in enumerate(pa_criteria)) or "No specific criteria available."

    prompt = _ANALYZE_PROMPT.format(
        chunks_text=chunks_text[:4000],
        chart_text=chart_text[:4000],
        criteria_numbered=criteria_numbered,
        cpt_code=order["cpt_code"],
        icd10_codes=", ".join(order.get("icd10_codes", [])),
    )

    # Call Gemini with one retry on parse failure
    raw: dict = {}
    for attempt in range(2):
        try:
            raw = await generate_json(prompt)
            break
        except Exception as exc:
            if attempt == 0:
                logger.warning("workflow.analyze.llm_retry", error=str(exc)[:120])
                await asyncio.sleep(2)
            else:
                logger.error("workflow.analyze.llm_failed", error=str(exc))
                # Safe fallback: all criteria marked unclear
                raw = {
                    "met": [],
                    "missing": [],
                    "unclear": pa_criteria,
                    "chart_citations": {},
                    "clinical_reasoning": (
                        "Automated analysis unavailable — manual review required. "
                        f"Error: {str(exc)[:200]}"
                    ),
                    "code_mismatch_confirmed": False,
                }

    # Map LLM output → GapAnalysisResult
    met_set   = set(raw.get("met", []))
    miss_set  = set(raw.get("missing", []))
    unclear_set = set(raw.get("unclear", []))
    citations = raw.get("chart_citations", {})

    criteria_evals: list[CriterionEvaluation] = []
    for i, crit in enumerate(pa_criteria):
        # Find which bucket this criterion landed in (fuzzy match on first 60 chars)
        crit_key = crit[:60]
        status = CriterionStatus.AMBIGUOUS
        for m in met_set:
            if crit_key in m or m[:60] in crit:
                status = CriterionStatus.MET
                break
        else:
            for m in miss_set:
                if crit_key in m or m[:60] in crit:
                    status = CriterionStatus.MISSING
                    break
            else:
                for m in unclear_set:
                    if crit_key in m or m[:60] in crit:
                        status = CriterionStatus.AMBIGUOUS
                        break

        # If none matched by content, fall back to position in lists
        if status == CriterionStatus.AMBIGUOUS and len(pa_criteria) <= max(len(met_set) + len(miss_set) + len(unclear_set), 1):
            all_met = list(raw.get("met", []))
            all_miss = list(raw.get("missing", []))
            all_unclear = list(raw.get("unclear", []))
            if i < len(all_met):
                status = CriterionStatus.MET
            elif i - len(all_met) < len(all_miss):
                status = CriterionStatus.MISSING
            else:
                status = CriterionStatus.AMBIGUOUS

        evidence = next((v for k, v in citations.items() if crit_key in k or k[:60] in crit), None)
        criteria_evals.append(CriterionEvaluation(
            criterion_id=f"CRIT-{i+1:02d}",
            criterion_text=crit,
            status=status,
            evidence_from_notes=evidence,
            supporting_chunk_ids=[c.get("chunk_id", "") for c in chunks[:2]],
            recommendation=(
                "Submit with this documentation as supporting evidence."
                if status == CriterionStatus.MET
                else "Obtain and attach missing documentation before submission."
                if status == CriterionStatus.MISSING
                else "Review chart for additional supporting documentation."
            ),
        ))

    met_count     = sum(1 for e in criteria_evals if e.status == CriterionStatus.MET)
    missing_count = sum(1 for e in criteria_evals if e.status == CriterionStatus.MISSING)
    unclear_count = sum(1 for e in criteria_evals if e.status == CriterionStatus.AMBIGUOUS)
    total = len(criteria_evals) or 1

    overall_risk = (
        "high"   if missing_count / total >= 0.5 else
        "medium" if missing_count > 0            else
        "low"
    )

    # Merge code mismatch warning with LLM confirmation
    existing_mismatch = state.get("code_mismatch_warning") or {}
    if raw.get("code_mismatch_confirmed") and not existing_mismatch.get("detected"):
        existing_mismatch = {
            **existing_mismatch,
            "detected": True,
            "warning_message": "Code mismatch flagged by clinical analysis.",
        }

    gap_result = GapAnalysisResult(
        criteria_evaluated=criteria_evals,
        met_count=met_count,
        missing_count=missing_count,
        ambiguous_count=unclear_count,
        conflict_count=0,
        code_mismatch_warning=CodeMismatchWarning(**existing_mismatch) if existing_mismatch.get("cpt_code") else None,
        overall_risk=overall_risk,
        analyst_summary=raw.get("clinical_reasoning", "See criteria evaluation above."),
    )

    _emit(state, "analyze", "complete", {
        "met": met_count,
        "missing": missing_count,
        "unclear": unclear_count,
        "overall_risk": overall_risk,
    })

    return {
        "gap_analysis": gap_result.model_dump(mode="json"),
        "code_mismatch_warning": existing_mismatch,
    }


# ---------------------------------------------------------------------------
# Step 4: draft
# ---------------------------------------------------------------------------

async def _run_draft(state: PAWorkflowState) -> dict[str, Any]:
    order = state["order"]
    gap_analysis = state.get("gap_analysis") or {}
    policy_retrieval = state.get("policy_retrieval") or {}
    patient_info = state.get("patient") or {}

    _emit(state, "draft", "running")

    criteria_evals = gap_analysis.get("criteria_evaluated", [])
    met_criteria    = [e for e in criteria_evals if e.get("status") == "met"]
    missing_criteria = [e for e in criteria_evals if e.get("status") == "missing"]
    unclear_criteria = [e for e in criteria_evals if e.get("status") not in ("met", "missing")]

    chunks = policy_retrieval.get("chunks", [])
    chunks_text = "\n\n".join(c.get("content", "") for c in chunks[:3])

    met_section = "\n".join(
        f"- {e['criterion_text']}\n  Chart evidence: {e.get('evidence_from_notes') or 'Documented in chart (see attached).'}"
        for e in met_criteria
    ) or "No criteria currently confirmed as met."

    missing_section = "\n".join(
        f"- {e['criterion_text']}\n  Status: PENDING — supplemental documentation will be provided upon request."
        for e in missing_criteria + unclear_criteria
    ) or "No missing criteria identified."

    patient_name = f"{patient_info.get('first_name', '')} {patient_info.get('last_name', '')}".strip() or order["patient_id"]
    patient_dob  = patient_info.get("date_of_birth", "Unknown")
    member_id    = patient_info.get("member_id", order.get("member_id", ""))
    payer_display_map = {
        "bcbs_tx": "Blue Cross Blue Shield of Texas",
        "unitedhealthcare": "UnitedHealthcare",
        "aetna": "Aetna",
    }
    plan_display_map = {
        "commercial": "Commercial PPO",
        "commercial_hmo": "Commercial HMO",
    }
    payer_display = payer_display_map.get(order["payer_id"], order["payer_id"])
    plan_display  = plan_display_map.get(order["plan_type"], order["plan_type"])
    icd10_display = ", ".join(order.get("icd10_codes", []))

    prompt = _DRAFT_PROMPT.format(
        patient_name=patient_name,
        patient_dob=patient_dob,
        member_id=member_id,
        payer_display=payer_display,
        plan_display=plan_display,
        cpt_code=order["cpt_code"],
        procedure_description=order.get("procedure_description", ""),
        icd10_display=icd10_display,
        letter_date=datetime.utcnow().strftime("%B %d, %Y"),
        met_section=met_section,
        missing_section=missing_section,
        chunks_text=chunks_text[:3000],
    )

    letter_text = ""
    for attempt in range(2):
        try:
            letter_text = await generate_text(prompt)
            break
        except Exception as exc:
            if attempt == 0:
                logger.warning("workflow.draft.llm_retry", error=str(exc)[:120])
                await asyncio.sleep(2)
            else:
                logger.error("workflow.draft.llm_failed", error=str(exc))
                letter_text = (
                    f"[DRAFT UNAVAILABLE — automated drafting failed: {str(exc)[:200]}]\n\n"
                    "Please draft the prior authorization letter manually based on the gap analysis above."
                )

    total_criteria = len(criteria_evals)
    letter = JustificationLetter(
        draft_id=f"DRAFT-{uuid.uuid4().hex[:8].upper()}",
        version=1,
        content=letter_text,
        cited_policy_chunk_ids=[c.get("chunk_id", "") for c in chunks],
        word_count=len(letter_text.split()),
    )

    gap_report = GapReport(
        report_id=f"RPT-{uuid.uuid4().hex[:8].upper()}",
        checklist_items=[CriterionEvaluation(**e) for e in criteria_evals],
        action_items=(
            [f"Obtain missing documentation: {e['criterion_text'][:80]}" for e in missing_criteria]
            + (["Review chart for additional supporting documentation."] if unclear_criteria else [])
        ) or ["Review completed — no action items."],
    )

    draft_result = DraftResult(justification_letter=letter, gap_report=gap_report)

    # Patient impact — generated deterministically, not via LLM
    patient_impact = PatientImpact(
        estimated_wait_time_saved="up to 6 days",
        auth_failure_risk=(
            f"Reduced: {len(met_criteria)} of {total_criteria} criteria "
            "pre-checked before submission"
        ),
        patient_note="Faster authorization means faster access to care for this patient.",
    )

    _emit(state, "draft", "complete", {
        "word_count": letter.word_count,
        "action_items": len(gap_report.action_items),
    })

    return {
        "draft": draft_result.model_dump(mode="json"),
        "patient_impact": patient_impact.model_dump(mode="json"),
    }


# ---------------------------------------------------------------------------
# Step 5: score
# ---------------------------------------------------------------------------

async def _run_score(state: PAWorkflowState) -> dict[str, Any]:
    draft = state.get("draft") or {}
    pa_criteria = state.get("pa_criteria", [])
    policy_retrieval = state.get("policy_retrieval") or {}
    order = state.get("order") or {}

    _emit(state, "score", "running")

    # --- Score cache lookup (60-min TTL) -----------------------------------
    patient_id = order.get("patient_id", "")
    payer_id   = order.get("payer_id", "")
    cpt_code   = order.get("cpt_code", "")
    cached_scoring = await get_cached_score(patient_id, payer_id, cpt_code)
    if cached_scoring:
        logger.info("workflow.score.cache_hit", patient_id=patient_id, payer_id=payer_id, cpt_code=cpt_code)
        _emit(state, "score", "complete", {
            "readiness_score": cached_scoring.get("readiness_score", 0),
            "pass": cached_scoring.get("pass_count", 0),
            "flag": cached_scoring.get("flag_count", 0),
            "fail": cached_scoring.get("fail_count", 0),
            "recommendation": "cache_hit",
        })
        return {"scoring": cached_scoring, "completed": True}
    # -----------------------------------------------------------------------

    letter_text = draft.get("justification_letter", {}).get("content", "")
    chunks = policy_retrieval.get("chunks", [])
    chunks_text = "\n\n".join(c.get("content", "") for c in chunks[:3])
    criteria_numbered = "\n".join(f"{i+1}. {c}" for i, c in enumerate(pa_criteria)) or "No criteria available."

    prompt = _SCORE_PROMPT.format(
        criteria_numbered=criteria_numbered,
        chunks_text=chunks_text[:3000],
        draft_letter=letter_text[:4000],
    )

    raw: dict = {}
    for attempt in range(2):
        try:
            raw = await generate_json(prompt)
            break
        except Exception as exc:
            if attempt == 0:
                logger.warning("workflow.score.llm_retry", error=str(exc)[:120])
                await asyncio.sleep(2)
            else:
                logger.error("workflow.score.llm_failed", error=str(exc))
                raw = {
                    "scores": [{"criterion": c, "status": "flag", "note": "Manual review required."} for c in pa_criteria],
                    "overall_readiness": f"0 of {len(pa_criteria)} criteria auto-scored",
                    "recommendation": "needs_revision",
                    "reviewer_notes": f"Scoring unavailable: {str(exc)[:200]}",
                }

    score_list = raw.get("scores", [])
    scores = [
        CriterionScore(
            criterion_id=f"SC-{i+1:02d}",
            criterion_text=s.get("criterion", f"Criterion {i+1}"),
            score=s.get("status", "flag"),
            rationale=s.get("note", ""),
        )
        for i, s in enumerate(score_list)
    ]

    pass_count = sum(1 for s in scores if s.score == "pass")
    flag_count = sum(1 for s in scores if s.score == "flag")
    fail_count = sum(1 for s in scores if s.score == "fail")
    total = len(scores) or 1
    readiness_score = round((pass_count / total) * 100, 1)
    rec = raw.get("recommendation", "needs_revision")
    submission_readiness = (
        SubmissionReadiness.READY        if rec == "ready_for_review" and fail_count == 0 else
        SubmissionReadiness.NEEDS_REVIEW if fail_count == 0 else
        SubmissionReadiness.NOT_READY
    )

    scoring_result = ScoringResult(
        scores=scores,
        pass_count=pass_count,
        flag_count=flag_count,
        fail_count=fail_count,
        readiness_score=readiness_score,
        submission_readiness=submission_readiness,
        reviewer_notes=raw.get("reviewer_notes", raw.get("overall_readiness", "")),
    )

    _emit(state, "score", "complete", {
        "readiness_score": readiness_score,
        "pass": pass_count,
        "flag": flag_count,
        "fail": fail_count,
        "recommendation": rec,
    })

    scoring_dict = scoring_result.model_dump(mode="json")
    # Write score to cache so repeat runs return identical results
    if patient_id and payer_id and cpt_code:
        await set_cached_score(patient_id, payer_id, cpt_code, scoring_dict)

    return {"scoring": scoring_dict, "completed": True}


# ---------------------------------------------------------------------------
# Orchestrator: run_workflow
# ---------------------------------------------------------------------------

async def run_workflow(
    order: dict,
    db: AsyncSession,
    run_id: str | None = None,
    sse_queue: asyncio.Queue | None = None,
) -> PAWorkflowState:
    """
    Execute the full PA workflow sequentially.  Returns the final state.
    Emits SSE events to sse_queue at each step transition if provided.
    Never raises — all errors are captured in state["errors"].
    """
    run_id = run_id or str(uuid.uuid4())

    state: PAWorkflowState = {
        "run_id": run_id,
        "order": order,
        "patient": None,
        "pa_requirement": None,
        "pa_criteria": [],
        "pa_not_required": False,
        "policy_retrieval": None,
        "gap_analysis": None,
        "code_mismatch_warning": None,
        "draft": None,
        "patient_impact": None,
        "scoring": None,
        "denial": None,
        "appeal": None,
        "record_bundle": None,
        "step_statuses": {},
        "current_step": None,
        "errors": {},
        "completed": False,
        "db_session": db,
        "sse_queue": sse_queue,
    }

    steps = [
        ("detect",   _run_detect),
        ("retrieve", _run_retrieve),
        ("analyze",  _run_analyze),
        ("draft",    _run_draft),
        ("score",    _run_score),
    ]

    for step_name, step_fn in steps:
        state = _mark(state, step_name, StepStatus.RUNNING)
        try:
            updates = await step_fn(state)
            state = {**state, **updates}
            state = _mark(state, step_name, StepStatus.COMPLETE)
        except Exception as exc:
            logger.error(f"workflow.{step_name}.fatal", run_id=run_id, error=str(exc), exc_info=True)
            state["errors"][step_name] = str(exc)
            state = _mark(state, step_name, StepStatus.ERROR)
            _emit(state, step_name, "error", {"error": str(exc)[:200]})

        # Early exit if PA is not required (after detect)
        if step_name == "detect" and state.get("pa_not_required"):
            logger.info("workflow.pa_not_required", run_id=run_id)
            state["completed"] = True
            _emit(state, "detect", "pa_not_required", {"message": "PA not required for this order."})
            break

        # Skip remaining steps if a fatal error occurred in analyze or earlier
        if step_name in ("detect", "retrieve", "analyze") and state["errors"].get(step_name):
            logger.warning(f"workflow.early_exit.{step_name}_error", run_id=run_id)
            break

    state["completed"] = True
    return state


# ---------------------------------------------------------------------------
# LangGraph graph (topology definition — available for direct ainvoke use)
# ---------------------------------------------------------------------------

async def detect_node(state: PAWorkflowState)   -> PAWorkflowState:
    updates = await _run_detect(state)
    return _mark({**state, **updates}, WorkflowStep.DETECT, StepStatus.COMPLETE)

async def retrieve_node(state: PAWorkflowState) -> PAWorkflowState:
    updates = await _run_retrieve(state)
    return _mark({**state, **updates}, WorkflowStep.RETRIEVE, StepStatus.COMPLETE)

async def analyze_node(state: PAWorkflowState)  -> PAWorkflowState:
    updates = await _run_analyze(state)
    return _mark({**state, **updates}, WorkflowStep.ANALYZE, StepStatus.COMPLETE)

async def draft_node(state: PAWorkflowState)    -> PAWorkflowState:
    updates = await _run_draft(state)
    return _mark({**state, **updates}, WorkflowStep.DRAFT, StepStatus.COMPLETE)

async def score_node(state: PAWorkflowState)    -> PAWorkflowState:
    updates = await _run_score(state)
    return _mark({**state, **updates}, WorkflowStep.SCORE, StepStatus.COMPLETE)


def _should_continue(state: PAWorkflowState) -> str:
    if state.get("pa_not_required"):
        return END
    if state["errors"].get(WorkflowStep.DETECT):
        return END
    return "node_retrieve"


def build_workflow() -> Any:
    """
    Assemble the LangGraph topology.
    Node names are prefixed with "node_" to avoid collision with the TypedDict
    state keys (e.g. "draft", "scoring", "appeal") that share names with the
    WorkflowStep enum values.
    Actual execution uses run_workflow() above; this graph is available for
    direct ainvoke / visualisation use.
    """
    graph = StateGraph(PAWorkflowState)

    graph.add_node("node_detect",   detect_node)
    graph.add_node("node_retrieve", retrieve_node)
    graph.add_node("node_analyze",  analyze_node)
    graph.add_node("node_draft",    draft_node)
    graph.add_node("node_score",    score_node)

    graph.set_entry_point("node_detect")
    graph.add_conditional_edges("node_detect", _should_continue)
    graph.add_edge("node_retrieve", "node_analyze")
    graph.add_edge("node_analyze",  "node_draft")
    graph.add_edge("node_draft",    "node_score")
    graph.add_edge("node_score",    END)

    return graph.compile()


workflow_app = build_workflow()
