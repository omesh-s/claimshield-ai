"""Regression: demo filing deadline math matches frontend canonical rules."""
from __future__ import annotations

from datetime import date

from app.data.filing_deadlines import calc_deadline, get_deadline_rule

# Mirrors frontend DEMO_FILING_CASES[DEMO-001].serviceDaysAgo
DEMO_001_SERVICE_DAYS_AGO = 14


def test_demo_001_bcbs_tx_deadline_matches_frontend_reference_day():
    ref_today = date(2026, 6, 3)
    service_date = date.fromordinal(ref_today.toordinal() - DEMO_001_SERVICE_DAYS_AGO)
    rule = get_deadline_rule("bcbs_tx")

    deadline_date, days_remaining = calc_deadline(service_date, rule.days)
    # Patch "today" by recomputing days_remaining with reference date
    days_remaining = (deadline_date - ref_today).days

    assert service_date.isoformat() == "2026-05-20"
    assert rule.days == 95
    assert deadline_date.isoformat() == "2026-08-23"
    assert days_remaining == 81
