"""
PA requirement rules service.
Primary path: mock clearinghouse API call (returns X12 271-aligned response).
Fallback path: local rules index evaluated in-process (returns PARequirementResult).
"""
from __future__ import annotations

from app.core.logging import get_logger
from app.models.schemas import PARequirementResult

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Local rules index — fallback when clearinghouse API is unavailable.
# Keyed by (payer_id, plan_type, cpt_code). Wildcard "*" matches any value.
# Specificity scoring: exact payer+plan+cpt wins over wildcards.
# ---------------------------------------------------------------------------

_LOCAL_RULES: list[dict] = [

    # --- BCBS TX / Commercial PPO / Coronary CTA ---
    {
        "payer_id": "bcbs_tx",
        "plan_type": "commercial",
        "cpt_code": "75571",
        "required": True,
        "reason": (
            "Cardiac CT angiography (CPT 75571) requires prior authorization under "
            "BCBS TX commercial PPO plans per Medical Policy MP-1.019."
        ),
        "confidence": 0.97,
        "recommendation": (
            "Submit prior authorization with: (1) cardiology consultation note dated "
            "within 12 months, (2) imaging indication from ordering physician, "
            "(3) referring provider note."
        ),
    },

    # --- United Healthcare / Commercial HMO / Cardiac MRI ---
    {
        "payer_id": "unitedhealthcare",
        "plan_type": "commercial_hmo",
        "cpt_code": "75561",
        "required": True,
        "reason": (
            "Cardiac MRI (CPT 75561) requires prior authorization under UHC commercial "
            "HMO plans per Coverage Determination Guideline CDG.CRD.056."
        ),
        "confidence": 0.96,
        "recommendation": (
            "Submit prior authorization with: (1) cardiologist note documenting "
            "cardiomyopathy, (2) echocardiogram results within 6 months, "
            "(3) ordering cardiologist credentials on file."
        ),
    },

    # --- Aetna / Commercial PPO / Coronary CTA ---
    {
        "payer_id": "aetna",
        "plan_type": "commercial",
        "cpt_code": "75571",
        "required": True,
        "reason": (
            "Cardiac CT angiography (CPT 75571) requires prior authorization under "
            "Aetna commercial PPO plans per Clinical Policy Bulletin CPB-0389."
        ),
        "confidence": 0.95,
        "recommendation": (
            "Submit prior authorization with: (1) cardiology consultation note dated "
            "within 12 months, (2) imaging indication from ordering physician, "
            "(3) referring provider note. Ensure ICD-10 code reflects cardiac indication."
        ),
    },

    # --- UHC / Medicare Advantage / Echocardiography (no PA required) ---
    {
        "payer_id": "unitedhealthcare",
        "plan_type": "medicare_advantage",
        "cpt_code": "93306",
        "required": False,
        "reason": (
            "Medicare Advantage plans under UHC do not require prior authorization for "
            "echocardiography (CPT 93306) when ordered by a cardiologist."
        ),
        "confidence": 0.88,
        "recommendation": (
            "Prior authorization is not required. Document this determination in the "
            "patient record and retain for audit purposes."
        ),
    },

    # --- Wildcard fallback (last resort) ---
    {
        "payer_id": "*",
        "plan_type": "*",
        "cpt_code": "*",
        "required": True,
        "reason": "Unable to determine PA requirement. Manual verification recommended.",
        "confidence": 0.30,
        "recommendation": (
            "Contact payer directly to confirm PA requirements before scheduling. "
            "Assume PA is required until confirmed otherwise."
        ),
    },
]


def check_pa_requirement_local(
    payer_id: str,
    plan_type: str,
    cpt_code: str,
) -> PARequirementResult:
    """
    Check the local rules index for PA requirement.
    Returns the most specific matching rule, using wildcard fallback if needed.
    """
    def _specificity(rule: dict) -> int:
        score = 0
        if rule["payer_id"] != "*":
            score += 4
        if rule["plan_type"] != "*":
            score += 2
        if rule["cpt_code"] != "*":
            score += 1
        return score

    candidates = [
        r for r in _LOCAL_RULES
        if (r["payer_id"] in (payer_id, "*"))
        and (r["plan_type"] in (plan_type, "*"))
        and (r["cpt_code"] in (cpt_code, "*"))
    ]

    if not candidates:
        return PARequirementResult(
            required=True,
            reason="No rule found. Defaulting to PA required pending manual verification.",
            source="local_rules",
            confidence=0.20,
            recommendation="Contact payer directly to confirm PA requirements.",
            is_fallback=True,
        )

    best = max(candidates, key=_specificity)
    is_wildcard = best["payer_id"] == "*"

    return PARequirementResult(
        required=best["required"],
        reason=best["reason"],
        source="local_rules",
        confidence=best["confidence"],
        recommendation=best["recommendation"],
        is_fallback=is_wildcard,
    )


async def check_pa_requirement(
    payer_id: str,
    plan_type: str,
    cpt_code: str,
    icd10_codes: list[str],
    provider_npi: str,
    member_id: str = "UNKNOWN",
) -> PARequirementResult:
    """
    Check PA requirement via clearinghouse API, falling back to local rules on error.
    Primary path returns X12 271-aligned data adapted to PARequirementResult.
    """
    from app.mocks.clearinghouse import check_prior_auth_required

    try:
        x12_response = await check_prior_auth_required(
            payer_id=payer_id,
            plan_type=plan_type,
            cpt_code=cpt_code,
            icd10_codes=icd10_codes,
            provider_npi=provider_npi,
            member_id=member_id,
        )
        logger.info(
            "rules.clearinghouse_hit",
            payer_id=payer_id,
            cpt_code=cpt_code,
            auth_required=x12_response.authRequired,
        )
        return PARequirementResult(
            required=x12_response.authRequired,
            reason=x12_response.authRequiredReason,
            source="clearinghouse_api",
            confidence=x12_response.confidence,
            recommendation=(
                "Proceed with prior authorization submission."
                if x12_response.authRequired
                else "Prior authorization is not required. Document in patient record."
            ),
            is_fallback=False,
            raw_response=x12_response.model_dump(),
        )
    except LookupError:
        logger.warning(
            "rules.clearinghouse_miss_fallback",
            payer_id=payer_id,
            plan_type=plan_type,
            cpt_code=cpt_code,
        )
        result = check_pa_requirement_local(payer_id, plan_type, cpt_code)
        return result
    except Exception as exc:
        logger.error("rules.clearinghouse_error_fallback", error=str(exc))
        result = check_pa_requirement_local(payer_id, plan_type, cpt_code)
        result.is_fallback = True
        return result
