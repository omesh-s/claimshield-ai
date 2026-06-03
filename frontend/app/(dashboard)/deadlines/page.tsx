"use client";

import { useMemo } from "react";
import { Clock, AlertTriangle, CheckCircle2, XCircle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listDemoFilingDeadlineRows } from "@/lib/filing-deadlines";

const STATUS_CONFIG = {
  ok: {
    label: "On Track",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    rowClass: "",
    Icon: CheckCircle2,
    iconClass: "text-emerald-500",
  },
  warning: {
    label: "Approaching",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    rowClass: "bg-amber-50/30",
    Icon: AlertTriangle,
    iconClass: "text-amber-500",
  },
  critical: {
    label: "Urgent",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
    rowClass: "bg-red-50/40",
    Icon: XCircle,
    iconClass: "text-red-500",
  },
} as const;

export default function DeadlinesPage() {
  const deadlineRows = useMemo(() => listDemoFilingDeadlineRows(), []);
  const statusCounts = useMemo(
    () => ({
      ok: deadlineRows.filter((r) => r.status === "ok").length,
      warning: deadlineRows.filter((r) => r.status === "warning").length,
      critical: deadlineRows.filter((r) => r.status === "critical").length,
    }),
    [deadlineRows]
  );

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Filing Deadlines</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Track state and payer filing deadline rules for active PA cases.
        </p>
      </div>

      <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p>
          <span className="font-semibold">Filing deadlines vary by payer and state.</span> Rules shown
          are seeded demo data. Verify with your payer contracts before relying on these dates.
          Late claims may be denied for untimely filing regardless of medical necessity.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border-emerald-100">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-emerald-700">{statusCounts.ok}</p>
              <p className="text-xs text-muted-foreground">On track (&gt; 30 days)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-100">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-amber-700">{statusCounts.warning}</p>
              <p className="text-xs text-muted-foreground">Approaching (15–30 days)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-100">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-red-700">{statusCounts.critical}</p>
              <p className="text-xs text-muted-foreground">Urgent (&lt; 15 days)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold text-foreground">Active Filing Deadlines</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-semibold text-muted-foreground py-2 pr-4">Patient</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground py-2 pr-4">Payer</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground py-2 pr-4">Service Date</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground py-2 pr-4">Filing Deadline</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground py-2 pr-4">Days Remaining</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {deadlineRows.map((row) => {
                  const cfg = STATUS_CONFIG[row.status];
                  const Icon = cfg.Icon;

                  return (
                    <tr key={row.rowId} className={`${cfg.rowClass} hover:bg-muted/20 transition-colors`}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-foreground">{row.patientName}</p>
                        <p className="text-[10px] text-muted-foreground">{row.patientId} · CPT {row.cptCode}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-foreground">{row.payer}</p>
                        <p className="text-[10px] text-muted-foreground">{row.rule.rule}</p>
                      </td>
                      <td className="py-3 pr-4 text-foreground font-mono text-xs">{row.serviceDate}</td>
                      <td className="py-3 pr-4">
                        <p className="text-foreground font-mono text-xs">{row.deadlineDate}</p>
                        <p className="text-[10px] text-muted-foreground">{row.deadlineDays}-day rule</p>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span
                          className={`text-lg font-bold ${row.status === "ok" ? "text-emerald-600" : row.status === "warning" ? "text-amber-600" : "text-red-600"}`}
                        >
                          {row.daysRemaining}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          <Icon className={`w-3.5 h-3.5 ${cfg.iconClass}`} />
                          <Badge className={`text-[10px] ${cfg.badgeClass}`}>{cfg.label}</Badge>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Action Required</h2>
        {deadlineRows.filter((r) => r.note).map((row) => {
          const cfg = STATUS_CONFIG[row.status];
          const Icon = cfg.Icon;
          return (
            <div
              key={row.rowId}
              className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs ${row.status === "ok" ? "bg-blue-50 border-blue-100 text-blue-800" : row.status === "warning" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-800"}`}
            >
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.iconClass}`} />
              <div>
                <span className="font-semibold">{row.patientName}:</span> {row.note}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
