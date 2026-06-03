"""
Record packaging service — assembles payer-ready clinical record bundles.
Implemented in Phase 6.
"""
from __future__ import annotations

from app.models.schemas import RecordBundle

# Stub — full implementation in Phase 6
async def build_record_bundle(
    patient_id: str,
    order_id: str,
    payer_id: str,
) -> RecordBundle:
    raise NotImplementedError("Record packaging implemented in Phase 6.")
