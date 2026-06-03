"""Denial / appeal demo context — seeded DEMO-001 must resolve patient, payer, and codes."""
from __future__ import annotations

from app.api.routes.denial import _get_patient_context
from app.data.demo_cases import APPEAL_CITATIONS, DENIAL_EVENTS


def test_demo_001_denial_context_and_citations():
    denial = DENIAL_EVENTS["DENIAL-10482736-001"]
    name, dob, payer, cpt, icd10s, patient_id = _get_patient_context(denial)

    assert denial.denial_id == "DENIAL-10482736-001"
    assert patient_id == "10482736"
    assert name == "James Mitchell"
    assert dob == "1966-03-15"
    assert payer == "Blue Cross Blue Shield of Texas"
    assert cpt == "75571"
    assert icd10s == ["I25.10"]
    assert len(APPEAL_CITATIONS[denial.denial_id]) == 3
