"""
Self-scoring service — second-pass model evaluation of the drafted justification.
Implemented in Phase 4.
"""
from __future__ import annotations

from app.models.schemas import DraftResult, PolicyRetrievalResult, ScoringResult

# Stub — full implementation in Phase 4
async def score_draft(
    draft: DraftResult,
    retrieval: PolicyRetrievalResult,
    clinical_notes: str,
) -> ScoringResult:
    raise NotImplementedError("Scoring service implemented in Phase 4.")
