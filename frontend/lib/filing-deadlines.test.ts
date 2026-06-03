import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildFilingDeadlineStatus,
  getDemoFilingDeadline,
  listDemoFilingDeadlineRows,
} from "./filing-deadlines";

/** Reference "today" for stable DEMO-001 assertions (matches 14 days after 2026-05-20). */
const REF_TODAY = new Date(2026, 5, 3); // 2026-06-03 local

afterEach(() => {
  vi.useRealTimers();
});

describe("DEMO-001 filing deadline consistency", () => {
  it("order and deadlines pages use the same canonical values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(REF_TODAY);

    const fromCase = getDemoFilingDeadline("DEMO-001", REF_TODAY);
    const fromTable = listDemoFilingDeadlineRows(REF_TODAY).find((r) => r.caseId === "DEMO-001");

    expect(fromCase).toBeDefined();
    expect(fromTable).toBeDefined();

    expect(fromCase!.serviceDate).toBe("2026-05-20");
    expect(fromCase!.deadlineDate).toBe("2026-08-23");
    expect(fromCase!.deadlineDays).toBe(95);
    expect(fromCase!.daysRemaining).toBe(81);

    expect(fromTable!.serviceDate).toBe(fromCase!.serviceDate);
    expect(fromTable!.deadlineDate).toBe(fromCase!.deadlineDate);
    expect(fromTable!.daysRemaining).toBe(fromCase!.daysRemaining);
    expect(fromTable!.status).toBe(fromCase!.status);
  });

  it("buildFilingDeadlineStatus matches getDemoFilingDeadline for DEMO-001 payer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(REF_TODAY);

    const demo = getDemoFilingDeadline("DEMO-001", REF_TODAY)!;
    const built = buildFilingDeadlineStatus("bcbs_tx", demo.serviceDate, REF_TODAY);

    expect(built.deadlineDate).toBe(demo.deadlineDate);
    expect(built.daysRemaining).toBe(demo.daysRemaining);
  });
});
