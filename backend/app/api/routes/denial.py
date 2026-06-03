"""
Denial lookup and appeal letter generation.

GET  /denial/{denial_id}  — fetch a denial event by ID
POST /denial/appeal       — generate a draft appeal letter using Gemini
"""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.core.logging import get_logger
from app.data.demo_cases import DENIAL_EVENTS, APPEAL_CITATIONS
from app.data.patients import PATIENT_DEMOGRAPHICS, FHIR_SERVICE_REQUESTS, ORDER_REQUESTS
from app.models.schemas import DenialEvent, AppealLetter, ErrorResponse
from app.services.llm import generate_text

logger = get_logger(__name__)
router = APIRouter(prefix="/denial", tags=["denial"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ORDER_ID_TO_PATIENT: dict[str, str] = {
    sr_id: sr.subject.reference.split("/")[-1]
    for sr_id, sr in FHIR_SERVICE_REQUESTS.items()
}

_PAYER_DISPLAY: dict[str, str] = {
    "bcbs_tx": "Blue Cross Blue Shield of Texas",
    "unitedhealthcare": "UnitedHealthcare",
    "aetna": "Aetna",
}


def _get_patient_context(
    denial: DenialEvent,
) -> tuple[str, str, str, str | None, list[str], str | None]:
    """Return (name, dob, payer_display, cpt_code, icd10_codes, patient_id) for the denial's order."""
    patient_id = _ORDER_ID_TO_PATIENT.get(denial.original_order_id)
    if patient_id:
        demo = PATIENT_DEMOGRAPHICS.get(patient_id)
        order = next((o for o in ORDER_REQUESTS.values() if o.patient_id == patient_id), None)
        payer_display = (
            _PAYER_DISPLAY.get(order.payer_id, order.payer_id) if order else "Unknown Payer"
        )
        if demo:
            return (
                f"{demo.first_name} {demo.last_name}",
                demo.date_of_birth,
                payer_display,
                order.cpt_code if order else None,
                list(order.icd10_codes) if order else [],
                patient_id,
            )

    return (
        "Patient (unknown)",
        "Unknown",
        denial.payer_reference_number or "Payer",
        None,
        [],
        None,
    )


def _build_appeal_prompt(
    denial: DenialEvent,
    citations: list[dict],
    patient_name: str,
    dob: str,
    payer_display: str,
    cpt_code: str | None,
    icd10_codes: list[str],
    patient_id: str | None,
) -> str:
    citations_text = "\n".join(
        f"  [{i+1}] {c['title']}\n"
        f"       Citation: {c['reference']}\n"
        f"       Clinical relevance: {c['relevance']}"
        for i, c in enumerate(citations)
    )

    return f"""You are a prior authorization specialist drafting a formal appeal letter to a health insurance payer.

DENIAL INFORMATION:
- Denial ID: {denial.denial_id}
- Payer Reference: {denial.payer_reference_number or "N/A"}
- Denial Date: {denial.denial_date}
- Denial Reason Code: {denial.denial_reason_code}
- Denial Reason Text: {denial.denial_reason_text}
- Appeal Deadline: {denial.appeal_deadline or "Within 60 days of denial"}

PATIENT:
- Patient ID (MRN): {patient_id or "N/A"}
- Name: {patient_name}
- Date of Birth: {dob}
- Payer: {payer_display or "Blue Cross Blue Shield of Texas"}
- CPT Code: {cpt_code or "See denial text"}
- ICD-10 Diagnosis: {", ".join(icd10_codes) if icd10_codes else "See clinical record"}
- Original Order ID: {denial.original_order_id}

SUPPORTING EVIDENCE (cite all of the following in the letter):
{citations_text}

SUPPLEMENTAL NOTE:
The patient's cardiology consultation documentation is pending retrieval from the referring cardiologist and will be provided as a supplemental submission within 10 business days.

Write a complete formal appeal letter with these requirements:
1. Professional clinical tone suitable for payer submission
2. Open with a clear statement of intent to appeal the denial
3. Quote the specific denial reason and address it point by point
4. Cite each of the 3 clinical guidelines above with specific page/section references
5. State clearly that supplemental cardiology documentation will be provided
6. Close with a request for expedited review and contact information for questions
7. Include a signature block for the ordering physician
8. Do NOT use markdown formatting — write in plain text with standard letter formatting
9. Include today's date: {datetime.utcnow().strftime("%B %d, %Y")}
10. The letter should be 400-550 words

Return ONLY the appeal letter text."""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/{denial_id}", response_model=DenialEvent)
async def get_denial(denial_id: str) -> DenialEvent:
    """Retrieve a denial event by ID (seeded or runtime)."""
    denial = DENIAL_EVENTS.get(denial_id)
    if not denial:
        raise HTTPException(status_code=404, detail=f"Denial '{denial_id}' not found.")
    return denial


@router.post(
    "/appeal",
    response_model=AppealLetter,
    responses={
        404: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
)
async def generate_appeal(denial: DenialEvent) -> AppealLetter:
    """
    Accept a denial event and generate a draft appeal letter using Gemini.

    The letter:
    - Acknowledges the specific denial reason
    - Cites ACC/AHA 2021 and supporting clinical guidelines
    - References the 3 seeded appeal citation records
    - States supplemental cardiology documentation will be provided
    - Uses the same professional clinical tone as the PA letter
    """
    logger.info(
        "appeal.generate.start",
        denial_id=denial.denial_id,
        denial_reason_code=denial.denial_reason_code,
    )

    # Get appeal citations (fallback to empty list if no citations seeded)
    citations = APPEAL_CITATIONS.get(denial.denial_id, [])
    if not citations:
        logger.warning("appeal.no_citations", denial_id=denial.denial_id)

    # Resolve patient context from the denial's original order ID
    patient_name, dob, payer_display, cpt_code, icd10_codes, patient_id = _get_patient_context(denial)

    # Build prompt and generate
    prompt = _build_appeal_prompt(
        denial,
        citations,
        patient_name,
        dob,
        payer_display,
        cpt_code,
        icd10_codes,
        patient_id,
    )

    try:
        content = await generate_text(prompt)
    except Exception as exc:
        logger.error("appeal.generate.llm_error", denial_id=denial.denial_id, error=str(exc))
        raise HTTPException(
            status_code=502,
            detail=f"Appeal letter generation failed: {str(exc)}. Please retry.",
        )

    appeal = AppealLetter(
        appeal_id=f"APPEAL-{str(uuid.uuid4())[:8].upper()}",
        denial_id=denial.denial_id,
        content=content,
        cited_policy_chunk_ids=[f"CITATION-{i+1}" for i in range(len(citations))],
        word_count=len(content.split()),
    )

    logger.info(
        "appeal.generate.complete",
        appeal_id=appeal.appeal_id,
        denial_id=denial.denial_id,
        word_count=appeal.word_count,
    )

    return appeal
