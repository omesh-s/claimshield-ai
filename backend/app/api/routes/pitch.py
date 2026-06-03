from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/pitch-context", tags=["pitch"])


class PitchContext(BaseModel):
    tam: str
    sam: str
    lead_customer: str
    pricing_model: str
    ip_moat: str
    ideal_first_customer_size: str


_PITCH_CONTEXT = PitchContext(
    tam=(
        "$35 billion spent annually on prior authorization administrative costs in the U.S."
    ),
    sam=(
        "Mid-size U.S. health systems processing 5,000 to 15,000 PA requests per year, "
        "representing roughly $500 million in addressable administrative cost"
    ),
    lead_customer=(
        "Regional health system with 3 to 5 hospitals, high commercial payer mix, "
        "existing Epic or Cerner EHR"
    ),
    pricing_model=(
        "SaaS subscription per health system per month, tiered by PA volume, "
        "with per-auth overage fees above tier limits"
    ),
    ip_moat=(
        "Payer-specific RAG pipelines, proprietary gap analysis scoring, and audit trail "
        "data that accumulates over time and improves retrieval quality"
    ),
    ideal_first_customer_size=(
        "100 to 500 bed health system, 5,000 to 15,000 PA requests per year"
    ),
)


@router.get("", response_model=PitchContext)
async def get_pitch_context() -> PitchContext:
    """
    Returns static product/business context for the judge-facing UI cards.
    Surfaces TAM/SAM, ICP, pricing model, and defensibility narrative.
    """
    return _PITCH_CONTEXT
