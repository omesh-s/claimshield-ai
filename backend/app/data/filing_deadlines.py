"""
Single source of truth for payer filing-deadline rules (backend side).

Key: payer_id as used in ORDER_REQUESTS / demo data.
Every backend endpoint that returns a deadline day-count MUST import from here.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class FilingDeadlineRule:
    payer_id: str
    payer_name: str
    state: str
    days: int
    rule: str


FILING_DEADLINES: dict[str, FilingDeadlineRule] = {
    "bcbs_tx": FilingDeadlineRule(
        payer_id="bcbs_tx",
        payer_name="BCBS Texas PPO",
        state="Texas",
        days=95,
        rule="Texas Insurance Code §1301.137",
    ),
    "aetna": FilingDeadlineRule(
        payer_id="aetna",
        payer_name="Aetna",
        state="Texas",
        days=90,
        rule="Aetna Provider Manual 2024",
    ),
    "united": FilingDeadlineRule(
        payer_id="united",
        payer_name="United Healthcare",
        state="Texas",
        days=90,
        rule="UHC Admin Guide 2024",
    ),
    # Alias used in demo orders
    "unitedhealthcare": FilingDeadlineRule(
        payer_id="unitedhealthcare",
        payer_name="United Healthcare",
        state="Texas",
        days=90,
        rule="UHC Admin Guide 2024",
    ),
}

_FALLBACK = FilingDeadlineRule(
    payer_id="unknown",
    payer_name="Unknown Payer",
    state="Unknown",
    days=90,
    rule="Refer to payer contract",
)


def get_deadline_rule(payer_id: str) -> FilingDeadlineRule:
    """Return the filing deadline rule for a payer, or a safe fallback."""
    return FILING_DEADLINES.get(payer_id.lower(), _FALLBACK)


def calc_deadline(service_date: date, days_allowed: int) -> tuple[date, int]:
    """
    Calculate deadline date and days remaining.

    Returns:
        (deadline_date, days_remaining)
        days_remaining is negative if the deadline has already passed.
    """
    deadline_date = service_date + timedelta(days=days_allowed)
    days_remaining = (deadline_date - date.today()).days
    return deadline_date, days_remaining
