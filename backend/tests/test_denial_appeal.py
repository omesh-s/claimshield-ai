"""Denial / appeal demo context — seeded DEMO-001 must resolve patient, payer, and codes."""
from __future__ import annotations

from app.api.routes.denial import _build_signature_block, _get_order_for_denial, _get_patient_context
from app.data.demo_cases import APPEAL_CITATIONS, DENIAL_EVENTS


def test_demo_001_denial_context_and_citations():
    denial = DENIAL_EVENTS["DENIAL-10482736-001"]
    name, dob, payer, cpt, icd10s, patient_id, order, signature = _get_patient_context(denial)

    assert denial.denial_id == "DENIAL-10482736-001"
    assert patient_id == "10482736"
    assert name == "James Mitchell"
    assert dob == "1966-03-15"
    assert payer == "Blue Cross Blue Shield of Texas"
    assert cpt == "75571"
    assert icd10s == ["I25.10"]
    assert len(APPEAL_CITATIONS[denial.denial_id]) == 3
    assert order is not None
    assert order.ordering_provider_name == "Dr. Patricia Hayes, MD"
    assert order.ordering_provider_npi == "1245319599"
    assert signature == (
        "Dr. Patricia Hayes, MD\n"
        "Internal Medicine\n"
        "NPI: 1245319599\n"
        "Phone: 555-0199"
    )


def test_signature_block_uses_order_provider():
    denial = DENIAL_EVENTS["DENIAL-10482736-001"]
    order = _get_order_for_denial(denial)
    assert _build_signature_block(order) == _build_signature_block(order)
    assert "Physician Name" not in _build_signature_block(order)
