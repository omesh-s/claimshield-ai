/**
 * Single source of truth for payer filing-deadline rules.
 *
 * Every component that displays a deadline day-count, countdown timer, or
 * deadline badge MUST import from this file — never hardcode the number
 * elsewhere.
 *
 * Key format: the payer_id values used in demo orders and ORDER_REQUESTS.
 */

export interface FilingDeadlineRule {
  payerId: string;
  payerName: string;
  state: string;
  days: number;
  rule: string;
}

export const FILING_DEADLINES: Record<string, FilingDeadlineRule> = {
  bcbs_tx: {
    payerId: "bcbs_tx",
    payerName: "BCBS Texas PPO",
    state: "Texas",
    days: 95,
    rule: "Texas Insurance Code §1301.137",
  },
  aetna: {
    payerId: "aetna",
    payerName: "Aetna",
    state: "Texas",
    days: 90,
    rule: "Aetna Provider Manual 2024",
  },
  united: {
    payerId: "united",
    payerName: "United Healthcare",
    state: "Texas",
    days: 90,
    rule: "UHC Admin Guide 2024",
  },
  // Alias used in demo data — maps to same rule as "united"
  unitedhealthcare: {
    payerId: "unitedhealthcare",
    payerName: "United Healthcare",
    state: "Texas",
    days: 90,
    rule: "UHC Admin Guide 2024",
  },
};

/**
 * Returns the filing deadline rule for a given payer ID, or a safe fallback.
 */
export function getDeadlineRule(payerId: string): FilingDeadlineRule {
  return (
    FILING_DEADLINES[payerId.toLowerCase()] ?? {
      payerId,
      payerName: payerId,
      state: "Unknown",
      days: 90,
      rule: "Refer to payer contract",
    }
  );
}

/**
 * Calculate deadline date and days remaining from a service date.
 *
 * @param serviceDateIso  ISO date string, e.g. "2026-05-01"
 * @param daysAllowed     Filing window in days (from FILING_DEADLINES)
 * @returns               { deadlineDate: string; daysRemaining: number }
 */
export function calcDeadline(
  serviceDateIso: string,
  daysAllowed: number
): { deadlineDate: string; daysRemaining: number } {
  const service = new Date(serviceDateIso);
  const deadline = new Date(service);
  deadline.setDate(deadline.getDate() + daysAllowed);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysRemaining = Math.round((deadline.getTime() - today.getTime()) / msPerDay);

  return {
    deadlineDate: deadline.toISOString().split("T")[0],
    daysRemaining,
  };
}
