"""
Mock clearinghouse API — prior auth eligibility lookup.

Response schema mirrors the X12 270/271 transaction format fields used in
real clearinghouse integrations (Availity, Change Healthcare, Office Ally, etc.).

X12 270  = Healthcare Eligibility Benefit Inquiry
X12 271  = Healthcare Eligibility Benefit Information (response)

Key 270/271 field mapping:
  memberId       → NM1 segment, subscriber ID
  payerId        → NM1*PR, payer ID
  planType       → EB*1, coverage type
  procedureCode  → SV1/HCP, CPT code
  authRequired   → UM segment, prior auth required flag
  criteria       → HSD/MSG, required criteria from payer
  responseDate   → DTP*291, date of adjudication
  transactionId  → ST*270 control number

In production this is replaced with a real X12 EDI client or clearinghouse REST API.
"""
from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# X12 270/271-aligned request / response models
# ---------------------------------------------------------------------------

class X12EligibilityRequest(BaseModel):
    """Models the key fields sent in an X12 270 transaction."""
    transactionId: str = Field(..., description="ST control number")
    memberId: str = Field(..., description="NM1 — subscriber member ID")
    payerId: str = Field(..., description="NM1*PR — payer EDI ID")
    planType: str = Field(..., description="EB*1 — coverage type")
    procedureCode: str = Field(..., description="SV1/HCP — CPT code")
    icd10Codes: list[str] = Field(default_factory=list, description="HI — diagnosis codes")
    providerNpi: str = Field(..., description="NM1*82 — provider NPI")
    requestDate: str = Field(
        default_factory=lambda: datetime.utcnow().strftime("%Y%m%d"),
        description="DTP*291 — date of inquiry",
    )


class X12AuthCriterion(BaseModel):
    """Single criterion from the payer's UM/HSD segment."""
    criterionId: str
    description: str
    required: bool


class X12EligibilityResponse(BaseModel):
    """Models the key fields returned in an X12 271 transaction."""
    transactionId: str = Field(..., description="ST control number — echoed from 270")
    memberId: str
    payerId: str
    planType: str
    procedureCode: str
    authRequired: bool = Field(..., description="UM*1 — prior auth required flag")
    authRequiredReason: str = Field(..., description="MSG segment — plain-text reason")
    criteria: list[X12AuthCriterion] = Field(
        default_factory=list,
        description="HSD/MSG — payer's required criteria for approval",
    )
    confidence: float = Field(..., ge=0.0, le=1.0)
    responseDate: str = Field(..., description="DTP*291 — date of adjudication")
    source: str = Field(default="clearinghouse_api")
    rawSegments: dict[str, str] | None = Field(None, description="Representative X12 segments")


# ---------------------------------------------------------------------------
# In-memory response registry — populated by register_mock_data() at startup
# ---------------------------------------------------------------------------

_MOCK_RESPONSES: dict[tuple[str, str, str], X12EligibilityResponse] = {}


def register_mock_data() -> None:
    """
    Register all mock X12 271 responses for seeded payer+plan+CPT combinations.
    Called once at application startup (app/core/startup.py).
    """
    today = datetime.utcnow().strftime("%Y%m%d")

    # --- BCBS TX / commercial / 75571 (Coronary CTA) ---
    register_mock_response(
        "bcbs_tx", "commercial", "75571",
        X12EligibilityResponse(
            transactionId="CHS-270-BCBS-75571-001",
            memberId="BCBS-PPO-7734521",
            payerId="bcbs_tx",
            planType="commercial",
            procedureCode="75571",
            authRequired=True,
            authRequiredReason=(
                "Prior authorization required for CT angiography of the heart (CPT 75571) "
                "under BCBS TX commercial PPO plans per Medical Policy MP-1.019."
            ),
            criteria=[
                X12AuthCriterion(
                    criterionId="BCBS-75571-C1",
                    description=(
                        "Cardiology evaluation within the past 12 months documenting "
                        "symptoms consistent with coronary artery disease, including a "
                        "formal cardiology consultation note signed by a board-eligible "
                        "or board-certified cardiologist."
                    ),
                    required=True,
                ),
                X12AuthCriterion(
                    criterionId="BCBS-75571-C2",
                    description=(
                        "Imaging indication clearly stated by the ordering physician, "
                        "including the specific clinical question and how the imaging "
                        "result will change patient management."
                    ),
                    required=True,
                ),
                X12AuthCriterion(
                    criterionId="BCBS-75571-C3",
                    description=(
                        "Referring provider note on file documenting the basis for "
                        "the referral and relevant clinical history."
                    ),
                    required=True,
                ),
            ],
            confidence=0.97,
            responseDate=today,
            rawSegments={
                "ISA": "ISA*00*          *00*          *ZZ*CLAIMSHIELD     *ZZ*BCBSTX         *240101*0900*^*00501*000000001*0*P*:",
                "GS":  "GS*HS*CLAIMSHIELD*BCBSTX*20240101*0900*1*X*005010X279A1",
                "ST":  "ST*271*0001*005010X279A1",
                "BHT": "BHT*0022*11*CHS-270-BCBS-75571-001*20240101*0900",
                "EB":  "EB*1*IND*30*HM**27*1**27",
                "UM":  "UM*SC*I*****Y",
            },
        ),
    )

    # --- United Healthcare / commercial_hmo / 75561 (Cardiac MRI) ---
    register_mock_response(
        "unitedhealthcare", "commercial_hmo", "75561",
        X12EligibilityResponse(
            transactionId="CHS-270-UHC-75561-001",
            memberId="UHC-HMO-4482019",
            payerId="unitedhealthcare",
            planType="commercial_hmo",
            procedureCode="75561",
            authRequired=True,
            authRequiredReason=(
                "Cardiac MRI (CPT 75561) requires prior authorization under "
                "UnitedHealthcare commercial HMO plans per Coverage Determination "
                "Guideline CDG.CRD.056."
            ),
            criteria=[
                X12AuthCriterion(
                    criterionId="UHC-75561-C1",
                    description=(
                        "Physician note documenting suspected or confirmed cardiomyopathy "
                        "or structural heart disease, including clinical findings, symptom "
                        "description, and diagnosis supporting the need for cardiac MRI. "
                        "Must be from the ordering cardiologist."
                    ),
                    required=True,
                ),
                X12AuthCriterion(
                    criterionId="UHC-75561-C2",
                    description=(
                        "Prior echocardiogram results within the past 6 months demonstrating "
                        "findings that indicate cardiac MRI is needed for further "
                        "characterization. An echocardiogram report with interpretation "
                        "must be included in the submission."
                    ),
                    required=True,
                ),
                X12AuthCriterion(
                    criterionId="UHC-75561-C3",
                    description=(
                        "Ordering cardiologist credentials on file — the ordering provider "
                        "must be a board-eligible or board-certified cardiologist with "
                        "active hospital privileges for advanced cardiac imaging orders."
                    ),
                    required=True,
                ),
            ],
            confidence=0.96,
            responseDate=today,
            rawSegments={
                "ISA": "ISA*00*          *00*          *ZZ*CLAIMSHIELD     *ZZ*UHCOFAMERICA   *240101*0900*^*00501*000000002*0*P*:",
                "ST":  "ST*271*0002*005010X279A1",
                "EB":  "EB*1*IND*86*HM**27*1**27",
                "UM":  "UM*SC*I*****Y",
            },
        ),
    )

    # --- Aetna / commercial / 75571 (Coronary CTA) ---
    register_mock_response(
        "aetna", "commercial", "75571",
        X12EligibilityResponse(
            transactionId="CHS-270-AETNA-75571-001",
            memberId="AETNA-PPO-9901344",
            payerId="aetna",
            planType="commercial",
            procedureCode="75571",
            authRequired=True,
            authRequiredReason=(
                "Prior authorization required for CT angiography of the heart (CPT 75571) "
                "under Aetna commercial PPO plans per Clinical Policy Bulletin CPB-0389."
            ),
            criteria=[
                X12AuthCriterion(
                    criterionId="AETNA-75571-C1",
                    description=(
                        "Cardiology evaluation within the past 12 months documenting "
                        "symptoms consistent with coronary artery disease, including a "
                        "formal cardiology consultation note signed by a board-eligible "
                        "or board-certified cardiologist."
                    ),
                    required=True,
                ),
                X12AuthCriterion(
                    criterionId="AETNA-75571-C2",
                    description=(
                        "Imaging indication clearly stated by the ordering physician, "
                        "including the specific clinical question and how the imaging "
                        "result will change patient management."
                    ),
                    required=True,
                ),
                X12AuthCriterion(
                    criterionId="AETNA-75571-C3",
                    description=(
                        "Referring provider note on file documenting the basis for "
                        "the referral and relevant clinical history."
                    ),
                    required=True,
                ),
            ],
            confidence=0.95,
            responseDate=today,
            rawSegments={
                "ISA": "ISA*00*          *00*          *ZZ*CLAIMSHIELD     *ZZ*AETNAINCORPCTD *240101*0900*^*00501*000000003*0*P*:",
                "ST":  "ST*271*0003*005010X279A1",
                "EB":  "EB*1*IND*30*HM**27*1**27",
                "UM":  "UM*SC*I*****Y",
            },
        ),
    )


def register_mock_response(
    payer_id: str,
    plan_type: str,
    cpt_code: str,
    response: X12EligibilityResponse,
) -> None:
    """Register a mock 271 response for a payer+plan+CPT combination."""
    _MOCK_RESPONSES[(payer_id, plan_type, cpt_code)] = response


async def check_prior_auth_required(
    payer_id: str,
    plan_type: str,
    cpt_code: str,
    icd10_codes: list[str],
    provider_npi: str,
    member_id: str = "UNKNOWN",
    transaction_id: str | None = None,
) -> X12EligibilityResponse:
    """
    Simulate an X12 270 → 271 clearinghouse round-trip.
    Returns X12EligibilityResponse or raises LookupError on unknown combination.
    """
    key = (payer_id, plan_type, cpt_code)
    response = _MOCK_RESPONSES.get(key)
    if response is None:
        raise LookupError(
            f"No mock clearinghouse response for payer={payer_id} "
            f"plan={plan_type} cpt={cpt_code}."
        )
    # Return a copy with the actual member ID and transaction ID applied
    return response.model_copy(update={
        "memberId": member_id,
        "transactionId": transaction_id or response.transactionId,
    })
