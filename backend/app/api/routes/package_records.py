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

_PAYER_DISPLAY = {
    "bcbs_tx": "BCBS Texas PPO",
    "aetna": "Aetna",
    "united": "United Healthcare",
    "unitedhealthcare": "United Healthcare",
}

BUNDLE_STATUS_READY_FOR_REVIEW = "Ready for Review"
BUNDLE_STATUS_SENT = "Sent"

# In-memory package store — persists for the lifetime of the server process.
_PACKAGE_STORE: list[dict] = []


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
    bundle_type: str = "Prior Auth Support"
    assembled_at: datetime
    patient_demographics: PatientDemographics | None
    artifacts: list[ChartArtifact]
    total_artifacts: int
    submission_checklist: list[SubmissionChecklistItem]
    denial_id: str | None = None
    notes: str | None = None


class PackageRecordsRequest(BaseModel):
    run_id: str = ""
    patient_id: str   # e.g., "DEMO-001" or "10482736"
    order_id: str = ""
    payer_id: str
    bundle_type: str = "Prior Auth Support"
    denial_id: str | None = None
    appeal_letter_content: str | None = None
    staff_approved: bool = False


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


def _build_appeal_checklist(denial_id: str | None) -> list[SubmissionChecklistItem]:
    """Checklist for denial-appeal packages."""
    ref = denial_id or "on file"
    return [
        SubmissionChecklistItem(
            item="Appeal letter (AI-drafted, staff reviewed)",
            status="complete",
            note="Appeal letter included in bundle for payer submission",
        ),
        SubmissionChecklistItem(
            item=f"Payer denial on file ({ref})",
            status="complete",
            note="Denial reason and reference attached to package",
        ),
        SubmissionChecklistItem(
            item="Supporting clinical chart artifacts",
            status="complete",
            note="Patient chart documents bundled with appeal",
        ),
        SubmissionChecklistItem(
            item="Guideline citations verified",
            status="pending",
            note="Clinical staff to confirm ACC/AHA and payer-policy citations",
        ),
        SubmissionChecklistItem(
            item="Supplemental cardiology documentation",
            status="action_required",
            note="Obtain and attach cardiology consultation note before payer submission",
        ),
        SubmissionChecklistItem(
            item="Payer appeal submission form",
            status="pending",
            note="Complete payer portal appeal form before final submission",
        ),
    ]


def _checklist_dicts_for_patient(
    patient_id: str,
    payer_id: str,
    bundle_type: str,
    denial_id: str | None = None,
) -> list[dict]:
    artifacts = list(CHART_ARTIFACTS.get(patient_id, []))
    if bundle_type == "Denial Appeal":
        items = _build_appeal_checklist(denial_id)
    else:
        items = _build_checklist(artifacts, payer_id, patient_id)
    return [i.model_dump() for i in items]


def _checklist_for_entry(entry: dict) -> list[SubmissionChecklistItem]:
    stored = entry.get("submission_checklist")
    if stored:
        return [SubmissionChecklistItem(**item) for item in stored]
    return [
        SubmissionChecklistItem(**item)
        for item in _checklist_dicts_for_patient(
            entry["patient_id"],
            entry["payer_id"],
            entry.get("bundle_type", "Prior Auth Support"),
            entry.get("denial_id"),
        )
    ]


def _find_bundle(bundle_id: str) -> dict | None:
    for entry in _PACKAGE_STORE:
        if entry.get("bundle_id") == bundle_id:
            return entry
    return None


def _init_package_store() -> None:
    if _PACKAGE_STORE:
        return
    _PACKAGE_STORE.append(
        {
            "bundle_id": "BUNDLE-89FF962F",
            "patient_id": "10482736",
            "patient_name": "James Mitchell",
            "payer_id": "bcbs_tx",
            "payer_name": "BCBS Texas PPO",
            "bundle_type": "Prior Auth Support",
            "status": BUNDLE_STATUS_READY_FOR_REVIEW,
            "staff_approved": False,
            "assembled_at": "2026-06-02T10:00:00",
            "order_id": "ORD-2024-10482736-001",
            "denial_id": None,
            "submission_checklist": _checklist_dicts_for_patient(
                "10482736", "bcbs_tx", "Prior Auth Support"
            ),
        }
    )


_init_package_store()


def _appeal_letter_artifact(denial_id: str | None, content: str) -> ChartArtifact:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    return ChartArtifact(
        artifact_id=f"ART-APPEAL-{str(uuid.uuid4())[:8].upper()}",
        artifact_type="progress_note",
        title=f"Appeal Letter — {denial_id or 'Denial'}",
        date=today,
        provider="ClaimShield AI — Staff Review Required",
        content=content,
        relevance_score=1.0,
    )


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


def _parse_assembled_at(value: str) -> datetime:
    if "T" in value:
        return datetime.fromisoformat(value.replace("Z", ""))
    return datetime.strptime(value, "%Y-%m-%d")


async def _assemble_package(request: PackageRecordsRequest) -> PackagedBundle:
    """
    Assemble a payer-ready bundle of supporting clinical records.

    Returns patient demographics, chart artifacts, and a structured
    submission checklist showing met criteria and next steps for staff.
    """
    _init_package_store()
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
    artifacts = list(CHART_ARTIFACTS.get(patient_id, []))
    is_appeal = request.bundle_type == "Denial Appeal"

    if request.appeal_letter_content:
        artifacts.insert(
            0,
            _appeal_letter_artifact(request.denial_id, request.appeal_letter_content),
        )

    checklist = (
        _build_appeal_checklist(request.denial_id)
        if is_appeal
        else _build_checklist(artifacts, request.payer_id, patient_id)
    )

    order_id = request.order_id or (
        request.denial_id if is_appeal and request.denial_id else f"ORDER-{patient_id}"
    )
    notes_parts = [
        "AI-assembled bundle for staff review. Verify all items in the submission "
        "checklist before payer submission. This bundle is a draft — do not submit "
        "without clinical staff approval.",
    ]
    if request.denial_id:
        notes_parts.append(f"Denial ID: {request.denial_id}.")
    if is_appeal:
        notes_parts.append("Denial appeal package — includes staff-reviewed appeal letter.")

    bundle = PackagedBundle(
        bundle_id=f"BUNDLE-{str(uuid.uuid4())[:8].upper()}",
        patient_id=patient_id,
        order_id=order_id,
        payer_id=request.payer_id,
        bundle_type=request.bundle_type,
        assembled_at=datetime.utcnow(),
        patient_demographics=demographics,
        artifacts=artifacts,
        total_artifacts=len(artifacts),
        submission_checklist=checklist,
        denial_id=request.denial_id,
        notes=" ".join(notes_parts),
    )

    logger.info(
        "package_records.complete",
        bundle_id=bundle.bundle_id,
        bundle_type=request.bundle_type,
        artifact_count=bundle.total_artifacts,
        checklist_items=len(checklist),
        denial_id=request.denial_id,
    )

    patient_name = (
        f"{demographics.first_name} {demographics.last_name}"
        if demographics else patient_id
    )
    bundle_status = (
        BUNDLE_STATUS_SENT if request.staff_approved else BUNDLE_STATUS_READY_FOR_REVIEW
    )
    _PACKAGE_STORE.insert(0, {
        "bundle_id": bundle.bundle_id,
        "patient_id": patient_id,
        "patient_name": patient_name,
        "payer_id": request.payer_id,
        "payer_name": _PAYER_DISPLAY.get(request.payer_id, request.payer_id),
        "bundle_type": request.bundle_type,
        "status": bundle_status,
        "staff_approved": request.staff_approved,
        "assembled_at": bundle.assembled_at.isoformat(),
        "order_id": order_id,
        "denial_id": request.denial_id,
        "submission_checklist": [i.model_dump() for i in checklist],
    })

    return bundle


@router.post(
    "/package",
    response_model=PackagedBundle,
    responses={404: {"model": ErrorResponse}},
)
async def package_records(request: PackageRecordsRequest) -> PackagedBundle:
    """Assemble a payer-ready bundle (legacy path)."""
    return await _assemble_package(request)


# Top-level alias: POST /api/v1/package-records
package_alias_router = APIRouter()


@package_alias_router.post(
    "/package-records",
    response_model=PackagedBundle,
    responses={404: {"model": ErrorResponse}},
)
async def package_records_alias(request: PackageRecordsRequest) -> PackagedBundle:
    """Assemble a record package (including denial appeal bundles)."""
    return await _assemble_package(request)


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
    _init_package_store()
    return [PackageSummary(**p) for p in _PACKAGE_STORE]


@package_alias_router.get(
    "/package-records/{bundle_id}",
    response_model=PackagedBundle,
    responses={404: {"model": ErrorResponse}},
)
async def get_package_record(bundle_id: str) -> PackagedBundle:
    """Return full bundle detail including submission checklist for inline review."""
    _init_package_store()
    entry = _find_bundle(bundle_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Bundle '{bundle_id}' not found.")

    patient_id = entry["patient_id"]
    demographics = PATIENT_DEMOGRAPHICS.get(patient_id)
    artifacts = list(CHART_ARTIFACTS.get(patient_id, []))
    checklist = _checklist_for_entry(entry)

    return PackagedBundle(
        bundle_id=entry["bundle_id"],
        patient_id=patient_id,
        order_id=entry.get("order_id", f"ORDER-{patient_id}"),
        payer_id=entry["payer_id"],
        bundle_type=entry.get("bundle_type", "Prior Auth Support"),
        assembled_at=_parse_assembled_at(entry["assembled_at"]),
        patient_demographics=demographics,
        artifacts=artifacts,
        total_artifacts=len(artifacts),
        submission_checklist=checklist,
        denial_id=entry.get("denial_id"),
        notes=None,
    )


@package_alias_router.patch(
    "/package-records/{bundle_id}/approve",
    response_model=PackageSummary,
    responses={404: {"model": ErrorResponse}},
)
async def approve_package_record(bundle_id: str) -> PackageSummary:
    """Mark a reviewed bundle as sent to payer (demo submission)."""
    _init_package_store()
    entry = _find_bundle(bundle_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Bundle '{bundle_id}' not found.")

    entry["staff_approved"] = True
    entry["status"] = BUNDLE_STATUS_SENT
    logger.info("package_records.sent", bundle_id=bundle_id)
    return PackageSummary(
        bundle_id=entry["bundle_id"],
        patient_id=entry["patient_id"],
        patient_name=entry["patient_name"],
        payer_id=entry["payer_id"],
        payer_name=entry["payer_name"],
        bundle_type=entry["bundle_type"],
        status=entry["status"],
        assembled_at=entry["assembled_at"],
    )


def count_denial_appeal_packages() -> int:
    """Count assembled packages with bundle_type Denial Appeal (session store)."""
    _init_package_store()
    return sum(1 for p in _PACKAGE_STORE if p.get("bundle_type") == "Denial Appeal")
