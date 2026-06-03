"""
Demo case definitions, denial cases, and filing deadline rules.

Three demo cases map directly to the seeded patients and orders:
  DEMO-001  Missing Cardiology Note   (P001 / BCBS / 75571)
  DEMO-002  Clean Approval            (P002 / UHC  / 75561)
  DEMO-003  Code Mismatch Warning     (P003 / Aetna / 75571)

One denial case is seeded for DEMO-001 (post-denial appeal flow).
"""
from __future__ import annotations

from app.models.schemas import (
    DemoCaseOption,
    DenialEvent,
    FilingDeadlineRule,
)

# ---------------------------------------------------------------------------
# Demo cases — in-memory registry (no DB required for demo reliability)
# ---------------------------------------------------------------------------

DEMO_CASE_OPTIONS: list[DemoCaseOption] = [
    DemoCaseOption(
        case_id="DEMO-001",
        label="Missing Cardiology Note",
        description=(
            "James Mitchell, 58M — BCBS TX PPO — Coronary CTA (CPT 75571) for CAD (I25.10). "
            "Imaging indication and referring provider note are present, but the required "
            "cardiology consultation note is absent. Produces a gap report with 2 met and "
            "1 missing criterion."
        ),
        scenario_tags=["pa_required", "missing_documentation", "gap_analysis", "draft_letter", "primary_demo"],
    ),
    DemoCaseOption(
        case_id="DEMO-002",
        label="Clean Approval",
        description=(
            "Sarah Chen, 45F — United Healthcare HMO — Cardiac MRI (CPT 75561) for "
            "dilated cardiomyopathy (I42.9). All three payer criteria are fully documented: "
            "cardiology note, echocardiogram results, and cardiologist credentials on file. "
            "Produces a clean approval draft with all criteria met."
        ),
        scenario_tags=["pa_required", "all_criteria_met", "clean_approval"],
    ),
    DemoCaseOption(
        case_id="DEMO-003",
        label="Code Mismatch Warning",
        description=(
            "Robert Torres, 62M — Aetna PPO — Coronary CTA (CPT 75571) submitted with "
            "pneumonia diagnosis (J18.9). A cardiac imaging procedure code paired with a "
            "respiratory diagnosis code triggers the CodeMismatchWarning modal before "
            "gap analysis runs. Staff must explicitly confirm or correct before proceeding."
        ),
        scenario_tags=["code_mismatch", "requires_confirmation", "cpt_icd10_conflict"],
    ),
]

DEMO_CASES_BY_ID: dict[str, DemoCaseOption] = {c.case_id: c for c in DEMO_CASE_OPTIONS}

# ---------------------------------------------------------------------------
# Denial cases — seeded for the denial/appeal demo flow
# ---------------------------------------------------------------------------

DENIAL_EVENTS: dict[str, DenialEvent] = {
    "DENIAL-P001-001": DenialEvent(
        denial_id="DENIAL-P001-001",
        original_order_id="ORD-2024-P001-001",
        denial_date="2024-11-18",
        denial_reason_code="DENL-MED-NECS-001",
        denial_reason_text=(
            "Not medically necessary. Cardiology evaluation documentation not present "
            "in submitted records. Per Blue Cross Blue Shield of Texas Medical Policy "
            "MP-1.019, a formal cardiology consultation note signed by a board-eligible "
            "or board-certified cardiologist dated within the past 12 months is required "
            "for prior authorization of coronary CT angiography (CPT 75571). The submitted "
            "record contains a primary care referring note only, which does not satisfy this "
            "requirement. Please resubmit with the required cardiology consultation documentation."
        ),
        denial_category="missing_documentation",
        payer_reference_number="BCBS-TX-PA-2024-44521",
        appeal_deadline="2025-01-17",   # 60 days from denial date
    ),
}

# Convenience: map demo case ID to its associated denial
DENIAL_BY_DEMO_CASE: dict[str, str] = {
    "DEMO-001": "DENIAL-P001-001",
}

# ---------------------------------------------------------------------------
# Appeal context — supporting evidence citations for appeal letters
# ---------------------------------------------------------------------------

APPEAL_CITATIONS: dict[str, list[dict]] = {
    "DENIAL-P001-001": [
        {
            "title": "ACC/AHA 2021 Guideline for the Evaluation and Diagnosis of Chest Pain",
            "reference": "Gulati M, et al. J Am Coll Cardiol. 2021;78(22):e187-e285.",
            "relevance": (
                "Recommends coronary CTA as an appropriate first-line noninvasive imaging "
                "test for intermediate-risk patients with chest pain symptoms consistent "
                "with possible obstructive CAD, particularly when prior testing is "
                "inconclusive or not yet performed."
            ),
        },
        {
            "title": "ACC Appropriate Use Criteria for Coronary Revascularization 2022",
            "reference": "Writing Committee Members. J Am Coll Cardiol. 2022;79(17):1705-1765.",
            "relevance": (
                "Coronary CTA is rated 'Appropriate' for evaluation of symptomatic patients "
                "with intermediate pre-test probability of CAD with multiple cardiovascular "
                "risk factors (hypertension, hyperlipidemia, former smoking) — matching the "
                "clinical profile of this patient."
            ),
        },
        {
            "title": "SCCT/ACR/AHA/ASE 2021 Appropriate Use of Cardiac CT",
            "reference": "Han D, et al. J Cardiovasc Comput Tomogr. 2021;15(2):146-165.",
            "relevance": (
                "CT coronary angiography is appropriate for chest pain evaluation in patients "
                "with ECG abnormalities and multiple risk factors, even without prior stress "
                "testing when there is an intermediate Duke treadmill score or inconclusive "
                "functional imaging data."
            ),
        },
    ],
}

# ---------------------------------------------------------------------------
# Filing deadline rules — Texas 95-day rule as primary demo example
# ---------------------------------------------------------------------------

FILING_DEADLINE_RULES: list[FilingDeadlineRule] = [
    FilingDeadlineRule(
        rule_id="TX-95-DAY-COMMERCIAL",
        state="TX",
        payer_id=None,   # applies to all payers in Texas
        plan_type="commercial",
        deadline_days=95,
        description=(
            "Texas Insurance Code §1301.137 requires that claims for health care services "
            "be submitted to a preferred provider benefit plan insurer no later than 95 days "
            "after the date the health care services are provided. Late claims may be denied "
            "for untimely filing regardless of medical necessity."
        ),
        source="Texas Insurance Code §1301.137 (TIC)",
    ),
    FilingDeadlineRule(
        rule_id="TX-95-DAY-MEDICARE-ADV",
        state="TX",
        payer_id=None,
        plan_type="medicare_advantage",
        deadline_days=365,
        description=(
            "Medicare Advantage plans must accept claims submitted within 12 months (365 days) "
            "of the date of service per CMS regulations (42 CFR §422.212). Texas-specific "
            "commercial rules do not override federal MA filing requirements."
        ),
        source="42 CFR §422.212 (CMS)",
    ),
    FilingDeadlineRule(
        rule_id="BCBS-TX-PA-RETRO-30",
        state="TX",
        payer_id="bcbs_tx",
        plan_type="commercial",
        deadline_days=30,
        description=(
            "BCBS TX accepts retroactive prior authorization requests only within 30 days "
            "of the service date for emergent or urgent procedures where prior auth was not "
            "obtainable before service. After 30 days, retroactive PA requests are denied."
        ),
        source="BCBS TX Provider Manual 2024, Section 7.4",
    ),
    FilingDeadlineRule(
        rule_id="UHC-HMO-PA-RETRO-30",
        state="TX",
        payer_id="unitedhealthcare",
        plan_type="commercial_hmo",
        deadline_days=30,
        description=(
            "UnitedHealthcare HMO plans require that prior authorization be obtained before "
            "non-emergent scheduled procedures. Retroactive authorization requests submitted "
            "within 30 days of service may be considered for urgent situations only."
        ),
        source="UHC Texas Provider Manual 2024, Chapter 5",
    ),
]

FILING_RULES_BY_ID: dict[str, FilingDeadlineRule] = {r.rule_id: r for r in FILING_DEADLINE_RULES}
