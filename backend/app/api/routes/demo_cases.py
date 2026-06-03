from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

from app.models.schemas import DemoCaseOption, DenialEvent, OrderRequest, FilingDeadlineRule
from app.data.demo_cases import (
    DEMO_CASE_OPTIONS,
    DEMO_CASES_BY_ID,
    DENIAL_EVENTS,
    DENIAL_BY_DEMO_CASE,
    FILING_DEADLINE_RULES,
    APPEAL_CITATIONS,
)
from app.data.patients import ORDER_REQUESTS, PATIENT_DEMOGRAPHICS

router = APIRouter(prefix="/demo-cases", tags=["demo"])


class DemoCaseDetail(BaseModel):
    case_id: str
    label: str
    description: str
    scenario_tags: list[str]
    order: OrderRequest
    patient_name: str
    payer_display: str
    denial_id: str | None = None


@router.get("", response_model=list[DemoCaseOption])
async def list_demo_cases() -> list[DemoCaseOption]:
    """Return all pre-seeded demo scenarios for one-click loading."""
    return DEMO_CASE_OPTIONS


@router.get("/{case_id}", response_model=DemoCaseDetail)
async def get_demo_case(case_id: str) -> DemoCaseDetail:
    """Return full detail for a specific demo case including the pre-filled order."""
    case = DEMO_CASES_BY_ID.get(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Demo case '{case_id}' not found.")

    order = ORDER_REQUESTS.get(case_id)
    if not order:
        raise HTTPException(status_code=404, detail=f"Order data for case '{case_id}' not found.")

    patient = PATIENT_DEMOGRAPHICS.get(order.patient_id)
    patient_name = (
        f"{patient.first_name} {patient.last_name}" if patient else order.patient_id
    )

    payer_display_map = {
        "bcbs_tx": "Blue Cross Blue Shield TX — Commercial PPO",
        "unitedhealthcare": "United Healthcare — Commercial HMO",
        "aetna": "Aetna — Commercial PPO",
    }

    denial_id = DENIAL_BY_DEMO_CASE.get(case_id)

    return DemoCaseDetail(
        case_id=case.case_id,
        label=case.label,
        description=case.description,
        scenario_tags=case.scenario_tags,
        order=order,
        patient_name=patient_name,
        payer_display=payer_display_map.get(order.payer_id, order.payer_id),
        denial_id=denial_id,
    )


@router.get("/{case_id}/denial", response_model=DenialEvent)
async def get_demo_denial(case_id: str) -> DenialEvent:
    """Return the seeded denial event for a demo case (used in denial/appeal flow)."""
    denial_id = DENIAL_BY_DEMO_CASE.get(case_id)
    if not denial_id:
        raise HTTPException(
            status_code=404,
            detail=f"No denial event seeded for demo case '{case_id}'.",
        )
    denial = DENIAL_EVENTS.get(denial_id)
    if not denial:
        raise HTTPException(status_code=404, detail=f"Denial '{denial_id}' not found.")
    return denial


@router.get("/{case_id}/appeal-citations", response_model=list[dict[str, Any]])
async def get_appeal_citations(case_id: str) -> list[dict[str, Any]]:
    """Return supporting literature citations for the appeal letter draft."""
    denial_id = DENIAL_BY_DEMO_CASE.get(case_id)
    if not denial_id:
        raise HTTPException(status_code=404, detail=f"No denial for case '{case_id}'.")
    return APPEAL_CITATIONS.get(denial_id, [])


@router.get("/filing-rules/all", response_model=list[FilingDeadlineRule])
async def list_filing_rules() -> list[FilingDeadlineRule]:
    """Return all seeded filing deadline rules."""
    return FILING_DEADLINE_RULES
