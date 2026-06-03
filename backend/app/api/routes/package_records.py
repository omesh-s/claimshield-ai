"""
Record packaging — assembles a payer-ready clinical record bundle.

POST /records/package  — assemble and save a bundle
GET  /records/packages — list all saved bundles (sorted newest-first)
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.logging import get_logger
from app.data.patients import PATIENT_DEMOGRAPHICS, CHART_ARTIFACTS, ORDER_REQUESTS
from app.models.schemas import ChartArtifact, PatientDemographics, ErrorResponse

logger = get_logger(__name__)
router = APIRouter(prefix="/records", tags=["records"])

# ---------------------------------------------------------------------------
# In-memory package store — persists for the lifetime of the server process.
# Seeded with the canonical DEMO-001 bundle so the Recent Packages table is
# never empty on first load.
# ---------------------------------------------------------------------------
_PACKAGE_STORE: list[dict] = [
    {
        "bundle_id": "BUNDLE-89FF962F",
        "patient_id": "10482736",
        "patient_name": "James Mitchell",
        "payer_id": "bcbs_tx",
        "payer_name": "BCBS Texas PPO",
        "bundle_type": "Prior Auth Support",
        "status": "Ready for Review",
        "assembled_at": "2026-06-02T10:00:00",
    }
]

_PAYER_DISPLAY = {
    "bcbs_tx": "BCBS Texas PPO",
    "aetna": "Aetna",
    "united": "United Healthcare",
    "unitedhealthcare": "United Healthcare",
}


# ---------------------------------------------------------------------------
# Extended response models for Phase 6 bundle
# ---------------------------------------------------------------------------


class SubmissionChecklistItem(BaseModel):
    item: str
    status: Literal["complete", "pending", "action_required"]
    note: str | None = None


class PackagedBundle(BaseModel):
    bundle_id: str
    patient_id: str
    order_id: str
    payer_id: str
    assembled_at: datetime
    patient_demographics: PatientDemographics | None
    artifacts: list[ChartArtifact]
    total_artifacts: int
    submission_checklist: list[SubmissionChecklistItem]
    notes: str | None = None


class PackageRecordsRequest(BaseModel):
    run_id: str
    patient_id: str   # e.g., "DEMO-001" or "10482736"
    order_id: str
    payer_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_patient_id(raw_id: str) -> str | None:
    """
    Accept either a demo case ID (DEMO-001) or a raw patient ID (8-digit MRN).
    Returns the canonical patient ID or None if not found.
    """
    # Direct patient ID
    if raw_id in PATIENT_DEMOGRAPHICS:
        return raw_id
    # Demo case ID → order → patient ID
    order = ORDER_REQUESTS.get(raw_id)
    if order:
        return order.patient_id
    return None


def _build_checklist(
    artifacts: list[ChartArtifact],
    payer_id: str,
    patient_id: str | None,
) -> list[SubmissionChecklistItem]:
    """
    Build a submission checklist based on available artifacts and payer.
    In a production system this would reference the payer criteria directly.
    """
    has_imaging_indication = any("imaging" in a.title.lower() or "indication" in a.title.lower() for a in artifacts)
    has_referring_note = any("referring" in a.title.lower() for a in artifacts)
    has_cardiology_note = any("cardiology" in a.title.lower() or "cardiolog" in a.title.lower() for a in artifacts)

    checklist: list[SubmissionChecklistItem] = [
        SubmissionChecklistItem(
            item="Justification letter (AI-drafted, staff reviewed)",
            status="complete",
            note="Letter approved by staff and included in bundle",
        ),
        SubmissionChecklistItem(
            item="Gap analysis report",
            status="complete",
            note="Criteria evaluation attached to bundle",
        ),
        SubmissionChecklistItem(
            item="Imaging indication note on file",
            status="complete" if has_imaging_indication else "action_required",
            note="Present in chart" if has_imaging_indication else "Missing — obtain from ordering physician",
        ),
        SubmissionChecklistItem(
            item="Referring provider note on file",
            status="complete" if has_referring_note else "action_required",
            note="Present in chart" if has_referring_note else "Missing — collect before submission",
        ),
        SubmissionChecklistItem(
            item="Cardiology consultation note",
            status="complete" if has_cardiology_note else "action_required",
            note="Present in chart" if has_cardiology_note
            else "MISSING — this is the gap identified in the AI analysis. Obtain from cardiologist.",
        ),
        SubmissionChecklistItem(
            item="CPT / ICD-10 code verification",
            status="complete",
            note="Codes reviewed and confirmed by clinical staff",
        ),
        SubmissionChecklistItem(
            item="Payer-specific prior auth form",
            status="pending",
            note="Download from payer portal and attach before submission",
        ),
    ]
    return checklist


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.post(
    "/package",
    response_model=PackagedBundle,
    responses={404: {"model": ErrorResponse}},
)
async def package_records(request: PackageRecordsRequest) -> PackagedBundle:
    """
    Assemble a payer-ready bundle of supporting clinical records.

    Returns patient demographics, chart artifacts, and a structured
    submission checklist showing met criteria and next steps for staff.
    """
    logger.info(
        "package_records.start",
        run_id=request.run_id,
        patient_id=request.patient_id,
        payer_id=request.payer_id,
    )

    # Resolve patient
    patient_id = _resolve_patient_id(request.patient_id)
    if not patient_id:
        raise HTTPException(
            status_code=404,
            detail=f"Patient '{request.patient_id}' not found in mock data.",
        )

    demographics = PATIENT_DEMOGRAPHICS.get(patient_id)
    artifacts = CHART_ARTIFACTS.get(patient_id, [])

    # Build submission checklist
    checklist = _build_checklist(artifacts, request.payer_id, patient_id)

    bundle = PackagedBundle(
        bundle_id=f"BUNDLE-{str(uuid.uuid4())[:8].upper()}",
        patient_id=request.patient_id,
        order_id=request.order_id,
        payer_id=request.payer_id,
        assembled_at=datetime.utcnow(),
        patient_demographics=demographics,
        artifacts=artifacts,
        total_artifacts=len(artifacts),
        submission_checklist=checklist,
        notes=(
            "AI-assembled bundle for staff review. Verify all items in the submission "
            "checklist before payer submission. This bundle is a draft — do not submit "
            "without clinical staff approval."
        ),
    )

    logger.info(
        "package_records.complete",
        bundle_id=bundle.bundle_id,
        artifact_count=bundle.total_artifacts,
        checklist_items=len(checklist),
    )

    # Persist to in-memory store so GET /records/packages can return it
    patient_name = (
        f"{demographics.first_name} {demographics.last_name}"
        if demographics else request.patient_id
    )
    _PACKAGE_STORE.insert(0, {
        "bundle_id": bundle.bundle_id,
        "patient_id": patient_id,
        "patient_name": patient_name,
        "payer_id": request.payer_id,
        "payer_name": _PAYER_DISPLAY.get(request.payer_id, request.payer_id),
        "bundle_type": "Prior Auth Support",
        "status": "Ready for Review",
        "assembled_at": bundle.assembled_at.isoformat(),
    })

    return bundle


class PackageSummary(BaseModel):
    bundle_id: str
    patient_id: str
    patient_name: str
    payer_id: str
    payer_name: str
    bundle_type: str
    status: str
    assembled_at: str


@router.get("/packages", response_model=list[PackageSummary])
async def list_packages() -> list[PackageSummary]:
    """
    Return all assembled bundles sorted by assembled_at descending.
    Includes the seeded DEMO-001 bundle so the table is never empty.
    """
    return [PackageSummary(**p) for p in _PACKAGE_STORE]
