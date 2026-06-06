"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  FileText,
  AlertTriangle,
  FolderOpen,
  Clock,
  ChevronRight,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listDemoFilingDeadlineRows } from "@/lib/filing-deadlines";
import { DEMO_INTEGRATION_META } from "@/lib/order-view";

const WORKFLOW_STAGES = [
  { key: "intake", label: "Intake" },
  { key: "pa_check", label: "PA Check" },
  { key: "policy", label: "Policy" },
  { key: "gap", label: "Gap Analysis" },
  { key: "draft", label: "Draft" },
  { key: "package", label: "Package" },
];

const TEMPLATES = [
  { id: "DEMO-001", label: "Missing Cardiology Note", patient: "10482736", payer: "BCBS TX" },
  { id: "DEMO-002", label: "Clean Approval", patient: "20193847", payer: "UHC HMO" },
  { id: "DEMO-003", label: "Code Mismatch Warning", patient: "30571629", payer: "Aetna" },
];

const NAV_LINKS = [
  { href: "/order", label: "New Order", icon: FileText },
  { href: "/denial", label: "Denial & Appeal", icon: AlertTriangle },
  { href: "/records", label: "Record Packages", icon: FolderOpen },
  { href: "/deadlines", label: "Filing Deadlines", icon: Clock },
];

export default function DashboardPage() {
  const deadlineRows = useMemo(() => listDemoFilingDeadlineRows(), []);
  const urgentCount = deadlineRows.filter((r) => r.status === "critical").length;
  const approachingCount = deadlineRows.filter((r) => r.status === "warning").length;

  return (
    <div className="w-full p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Operations Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Prior authorization queue, workflow templates, and filing status.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-foreground">{TEMPLATES.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Workflow templates</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-foreground">{deadlineRows.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Active PA cases</p>
          </CardContent>
        </Card>
        <Card className={urgentCount > 0 ? "border-red-200" : ""}>
          <CardContent className="pt-4 pb-4">
            <p className={`text-2xl font-bold ${urgentCount > 0 ? "text-red-600" : "text-foreground"}`}>
              {urgentCount}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Urgent filing deadlines</p>
          </CardContent>
        </Card>
        <Card className={approachingCount > 0 ? "border-amber-200" : ""}>
          <CardContent className="pt-4 pb-4">
            <p className={`text-2xl font-bold ${approachingCount > 0 ? "text-amber-600" : "text-foreground"}`}>
              {approachingCount}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Approaching deadlines</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Standard Workflow Stages
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {WORKFLOW_STAGES.map((stage, i) => (
              <div key={stage.key} className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] font-medium">
                  {stage.label}
                </Badge>
                {i < WORKFLOW_STAGES.length - 1 && (
                  <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-foreground">Workflow Templates</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 space-y-2">
            {TEMPLATES.map((t) => (
              <Link
                key={t.id}
                href="/order"
                className="flex items-center justify-between p-2.5 rounded-md border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {t.id} · {t.patient} · {t.payer}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 truncate">
                    {DEMO_INTEGRATION_META[t.id]?.source_system}
                  </p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold text-foreground">Quick Navigation</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 space-y-1.5">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-foreground hover:bg-muted/50 transition-colors"
              >
                <Icon className="w-4 h-4 text-primary" />
                <span className="flex-1">{label}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">Filing Deadline Summary</CardTitle>
            <Link href="/deadlines" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="space-y-1.5">
            {deadlineRows.map((row) => (
              <div
                key={row.rowId}
                className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0"
              >
                <div>
                  <span className="font-medium text-foreground">{row.patientName}</span>
                  <span className="text-muted-foreground ml-2 font-mono">{row.cptCode}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-semibold tabular-nums ${
                      row.status === "critical"
                        ? "text-red-600"
                        : row.status === "warning"
                        ? "text-amber-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {row.daysRemaining}d
                  </span>
                  {row.status === "ok" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <AlertTriangle
                      className={`w-3.5 h-3.5 ${row.status === "critical" ? "text-red-500" : "text-amber-500"}`}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
