"""
Mock EHR service — returns data structured after the FHIR R4 ServiceRequest resource.

This is not a full FHIR server. Field names and coding structures follow FHIR R4
so integrations written against this mock require minimal changes when connecting
to a real Epic/Cerner FHIR endpoint.

FHIR R4 ServiceRequest reference:
  https://www.hl7.org/fhir/R4/servicerequest.html

In production this module is replaced with a real FHIR R4 client (smart-on-fhir).
"""
from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field

from app.models.schemas import PatientDemographics, ChartArtifact


# ---------------------------------------------------------------------------
# FHIR R4 building-block types (minimal subset needed for PA workflow)
# ---------------------------------------------------------------------------

class FHIRCoding(BaseModel):
    system: str
    code: str
    display: str


class FHIRCodeableConcept(BaseModel):
    coding: list[FHIRCoding]
    text: str | None = None


class FHIRReference(BaseModel):
    reference: str
    display: str | None = None


class FHIRAnnotation(BaseModel):
    text: str
    time: str | None = None


class FHIRServiceRequest(BaseModel):
    """
    FHIR R4 ServiceRequest resource (subset for prior auth).
    Field names match the FHIR R4 spec exactly.
    """
    resourceType: str = "ServiceRequest"
    id: str
    status: str = Field(..., description="active | draft | completed | revoked")
    intent: str = Field(..., description="order | proposal | plan | directive")
    subject: FHIRReference = Field(..., description="Patient reference")
    requester: FHIRReference = Field(..., description="Ordering provider reference")
    code: FHIRCodeableConcept = Field(..., description="CPT procedure code")
    reasonCode: list[FHIRCodeableConcept] = Field(
        default_factory=list,
        description="ICD-10 diagnosis codes supporting the procedure",
    )
    note: list[FHIRAnnotation] = Field(
        default_factory=list,
        description="Free-text clinical notes",
    )
    authoredOn: str | None = None
    insurance: list[FHIRReference] = Field(default_factory=list)
    meta: dict[str, Any] | None = None


class FHIRPatient(BaseModel):
    """FHIR R4 Patient resource (subset)."""
    resourceType: str = "Patient"
    id: str
    name: list[dict[str, Any]]
    birthDate: str
    gender: str
    identifier: list[dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# In-memory registries — populated by register_mock_data() at startup
# ---------------------------------------------------------------------------

_FHIR_PATIENTS: dict[str, FHIRPatient] = {}
_FHIR_SERVICE_REQUESTS: dict[str, FHIRServiceRequest] = {}
_PATIENT_DEMOGRAPHICS: dict[str, PatientDemographics] = {}
_CHART_ARTIFACTS: dict[str, list[ChartArtifact]] = {}


def register_mock_data() -> None:
    """
    Load all seed patient data from app.data.patients into the in-memory registries.
    Called once at application startup (app/core/startup.py).
    """
    from app.data.patients import (
        FHIR_PATIENTS,
        FHIR_SERVICE_REQUESTS,
        PATIENT_DEMOGRAPHICS,
        CHART_ARTIFACTS,
    )

    _FHIR_PATIENTS.update(FHIR_PATIENTS)
    _FHIR_SERVICE_REQUESTS.update(FHIR_SERVICE_REQUESTS)
    _PATIENT_DEMOGRAPHICS.update(PATIENT_DEMOGRAPHICS)
    _CHART_ARTIFACTS.update(CHART_ARTIFACTS)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_patient_fhir(patient_id: str) -> FHIRPatient | None:
    """Return a FHIR R4 Patient resource for the given patient ID."""
    return _FHIR_PATIENTS.get(patient_id)


async def get_patient_demographics(patient_id: str) -> PatientDemographics | None:
    """Return ClaimShield internal PatientDemographics for the given patient ID."""
    return _PATIENT_DEMOGRAPHICS.get(patient_id)


async def get_service_request(order_id: str) -> FHIRServiceRequest | None:
    """Return a FHIR R4 ServiceRequest for the given order ID."""
    return _FHIR_SERVICE_REQUESTS.get(order_id)


async def get_chart_artifacts(patient_id: str) -> list[ChartArtifact]:
    """Return all chart artifacts (progress notes, imaging, labs) for a patient."""
    return _CHART_ARTIFACTS.get(patient_id, [])


async def build_service_request_from_order(
    order_id: str,
    patient_id: str,
    cpt_code: str,
    cpt_display: str,
    icd10_codes: list[str],
    icd10_displays: dict[str, str],
    provider_npi: str,
    provider_name: str,
    clinical_notes: str | None,
    authored_on: str,
    member_id: str,
) -> FHIRServiceRequest:
    """
    Construct a FHIR R4 ServiceRequest from ClaimShield order fields.
    Used to produce a standards-aligned structure for payer submission packages.
    """
    return FHIRServiceRequest(
        id=order_id,
        status="active",
        intent="order",
        subject=FHIRReference(reference=f"Patient/{patient_id}"),
        requester=FHIRReference(
            reference=f"Practitioner/{provider_npi}",
            display=provider_name,
        ),
        code=FHIRCodeableConcept(
            coding=[
                FHIRCoding(
                    system="http://www.ama-assn.org/go/cpt",
                    code=cpt_code,
                    display=cpt_display,
                )
            ],
            text=cpt_display,
        ),
        reasonCode=[
            FHIRCodeableConcept(
                coding=[
                    FHIRCoding(
                        system="http://hl7.org/fhir/sid/icd-10-cm",
                        code=icd,
                        display=icd10_displays.get(icd, icd),
                    )
                ],
                text=icd10_displays.get(icd, icd),
            )
            for icd in icd10_codes
        ],
        note=[FHIRAnnotation(text=clinical_notes, time=authored_on)]
        if clinical_notes
        else [],
        authoredOn=authored_on,
        insurance=[FHIRReference(reference=f"Coverage/{member_id}")],
    )
