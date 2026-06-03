/**
 * Single source of truth for payer filing-deadline rules and deadline math.
 *
 * Demo case rows (DEMO-001..003) share `DEMO_FILING_CASES` + `buildFilingDeadlineStatus`
 * so New Order and Filing Deadlines always show the same dates and countdown.
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
  unitedhealthcare: {
    payerId: "unitedhealthcare",
    payerName: "United Healthcare",
    state: "Texas",
    days: 90,
    rule: "UHC Admin Guide 2024",
  },
};

export type FilingUrgency = "ok" | "warning" | "critical";

/** Canonical computed deadline for one PA case (shared by all UI). */
export interface FilingDeadlineStatus {
  rule: FilingDeadlineRule;
  serviceDate: string;
  deadlineDate: string;
  deadlineDays: number;
  daysRemaining: number;
  status: FilingUrgency;
}

/** Demo filing rows — serviceDaysAgo is the only per-case offset; all math is shared. */
export interface DemoFilingCaseConfig {
  rowId: string;
  caseId: string;
  patientName: string;
  patientId: string;
  payerId: string;
  cptCode: string;
  serviceDaysAgo: number;
  note: string;
}

export const DEMO_FILING_CASES: DemoFilingCaseConfig[] = [
  {
    rowId: "FD-001",
    caseId: "DEMO-001",
    patientName: "James Mitchell",
    patientId: "10482736",
    payerId: "bcbs_tx",
    cptCode: "75571",
    serviceDaysAgo: 14,
    note: "Cardiology note still pending — obtain before day 30 to avoid retroactive PA issues.",
  },
  {
    rowId: "FD-002",
    caseId: "DEMO-002",
    patientName: "Sarah Chen",
    patientId: "20193847",
    payerId: "unitedhealthcare",
    cptCode: "75561",
    serviceDaysAgo: 45,
    note: "Approaching midpoint. Ensure PA is obtained before service if not already completed.",
  },
  {
    rowId: "FD-003",
    caseId: "DEMO-003",
    patientName: "Robert Torres",
    patientId: "30571629",
    payerId: "aetna",
    cptCode: "75571",
    serviceDaysAgo: 80,
    note: "URGENT: approaching deadline. Immediate action required to submit before deadline.",
  },
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Parse YYYY-MM-DD as local calendar date (avoids UTC shift). */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatLocalDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function serviceDateDaysAgo(daysAgo: number, ref: Date = new Date()): string {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return formatLocalDateIso(d);
}

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

export function urgencyFromDaysRemaining(daysRemaining: number): FilingUrgency {
  if (daysRemaining > 30) return "ok";
  if (daysRemaining >= 15) return "warning";
  return "critical";
}

/**
 * Calculate deadline date and days remaining from a service date.
 * Uses local calendar dates; days remaining matches backend timedelta .days (floor).
 */
export function calcDeadline(
  serviceDateIso: string,
  daysAllowed: number,
  ref: Date = new Date()
): { deadlineDate: string; daysRemaining: number } {
  const service = parseLocalDate(serviceDateIso);
  const deadline = new Date(service);
  deadline.setDate(deadline.getDate() + daysAllowed);

  const today = new Date(ref);
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);

  const daysRemaining = Math.floor((deadline.getTime() - today.getTime()) / MS_PER_DAY);

  return {
    deadlineDate: formatLocalDateIso(deadline),
    daysRemaining,
  };
}

/** Build the canonical deadline object for any payer + service date. */
export function buildFilingDeadlineStatus(
  payerId: string,
  serviceDateIso: string,
  ref: Date = new Date()
): FilingDeadlineStatus {
  const rule = getDeadlineRule(payerId);
  const { deadlineDate, daysRemaining } = calcDeadline(serviceDateIso, rule.days, ref);
  return {
    rule,
    serviceDate: serviceDateIso,
    deadlineDate,
    deadlineDays: rule.days,
    daysRemaining,
    status: urgencyFromDaysRemaining(daysRemaining),
  };
}

export function getDemoFilingCase(caseId: string): DemoFilingCaseConfig | undefined {
  return DEMO_FILING_CASES.find((c) => c.caseId === caseId);
}

/** Deadline status for a demo case (same object shape on Order + Deadlines pages). */
export function getDemoFilingDeadline(
  caseId: string,
  ref: Date = new Date()
): FilingDeadlineStatus | undefined {
  const demo = getDemoFilingCase(caseId);
  if (!demo) return undefined;
  const serviceDate = serviceDateDaysAgo(demo.serviceDaysAgo, ref);
  return buildFilingDeadlineStatus(demo.payerId, serviceDate, ref);
}

export interface DemoFilingDeadlineRow extends DemoFilingCaseConfig, FilingDeadlineStatus {
  payer: string;
}

/** Rows for the Filing Deadlines table — derived from shared demo config + math. */
export function listDemoFilingDeadlineRows(ref: Date = new Date()): DemoFilingDeadlineRow[] {
  return DEMO_FILING_CASES.map((demo) => {
    const serviceDate = serviceDateDaysAgo(demo.serviceDaysAgo, ref);
    const status = buildFilingDeadlineStatus(demo.payerId, serviceDate, ref);
    return {
      ...demo,
      ...status,
      payer: status.rule.payerName,
    };
  });
}
