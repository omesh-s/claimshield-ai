"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Package,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Download,
  FileText,
  Users,
  FolderOpen,
  Square,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { recordsApi, type PackageSummary } from "@/lib/api";
import type { PackagedBundle, SubmissionChecklistItem } from "@/types";

const INPUT =
  "w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const SELECT =
  "w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50 disabled:cursor-not-allowed";
const LABEL = "block text-xs font-medium text-muted-foreground mb-1";

const PAYERS = [
  { label: "BCBS Texas PPO", value: "bcbs_tx" },
  { label: "Aetna", value: "aetna" },
  { label: "United Healthcare", value: "unitedhealthcare" },
];

const BUNDLE_TYPES = [
  "Prior Auth Support",
  "Denial Appeal",
  "Patient Transfer",
  "Payer Audit",
];


interface FormState {
  patient_id: string;
  payer_id: string;
  bundle_type: string;
}

function ChecklistRow({ item }: { item: SubmissionChecklistItem }) {
  const isComplete = item.status === "complete";
  const isPending = item.status === "pending";
  const isAction = item.status === "action_required";

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border ${
        isAction
          ? "bg-red-50 border-red-200"
          : isPending
          ? "bg-muted/40 border-border"
          : "bg-emerald-50/60 border-emerald-100"
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {isComplete && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
        {isAction && <AlertTriangle className="w-4 h-4 text-red-500" />}
        {isPending && <Square className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isAction ? "text-red-800" : isPending ? "text-muted-foreground" : "text-foreground"}`}>
          {item.item}
        </p>
        {item.note && (
          <p className={`text-xs mt-0.5 ${isAction ? "text-red-700" : "text-muted-foreground"}`}>
            {item.note}
          </p>
        )}
      </div>
      <Badge
        className={`text-[10px] shrink-0 ${
          isComplete
            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
            : isAction
            ? "bg-red-100 text-red-700 border-red-200"
            : "bg-muted text-muted-foreground border-border"
        }`}
      >
        {isComplete ? "Complete" : isAction ? "Action Required" : "Pending"}
      </Badge>
    </div>
  );
}

export default function RecordsPage() {
  const [form, setForm] = useState<FormState>({
    patient_id: "",
    payer_id: "bcbs_tx",
    bundle_type: "Prior Auth Support",
  });
  const [loading, setLoading] = useState(false);
  const [bundle, setBundle] = useState<PackagedBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);

  const fetchPackages = useCallback(async () => {
    try {
      const data = await recordsApi.listPackages();
      setPackages(data);
    } catch {
      // Non-fatal — table stays empty on fetch error
    } finally {
      setPackagesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  function field(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBundle(null);

    if (!form.patient_id) {
      setError("Patient ID is required.");
      return;
    }

    setLoading(true);
    try {
      const result = await recordsApi.packageRecords({
        run_id: `run-${Date.now().toString(36)}`,
        patient_id: form.patient_id,
        order_id: `ORDER-${form.patient_id.toUpperCase()}`,
        payer_id: form.payer_id,
      });
      setBundle(result);
      toast.success("Bundle assembled successfully", { duration: 4000 });
      // Refresh the recent packages table from the server
      fetchPackages();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to assemble bundle.";
      setError(msg);
      toast.error("Bundle assembly failed", { duration: 4000 });
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    if (!bundle) return;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bundle.bundle_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const completedCount = bundle?.submission_checklist.filter((i) => i.status === "complete").length ?? 0;
  const actionCount = bundle?.submission_checklist.filter((i) => i.status === "action_required").length ?? 0;

  return (
    <div className="px-12 py-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FolderOpen className="w-5 h-5 text-primary" />
          <h1 className="text-4xl font-bold text-foreground">Record Packages</h1>
        </div>
        <p className="text-base text-muted-foreground">
          Assemble and export payer-ready clinical record bundles.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assembly form */}
        <Card className="border border-border">
          <CardHeader className="pb-4 pt-5">
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Assemble Bundle
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Select a patient and payer to assemble a payer-ready clinical record bundle.
            </p>
          </CardHeader>
          <CardContent className="pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={LABEL}>Patient ID <span className="text-destructive">*</span></label>
                <input
                  className={INPUT}
                  placeholder="e.g. 10482736"
                  value={form.patient_id}
                  onChange={(e) => field("patient_id", e.target.value)}
                  disabled={loading}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Demo patients: 10482736, 20193847, 30571629</p>
              </div>

              <div>
                <label className={LABEL}>Bundle Type</label>
                <select
                  className={SELECT}
                  value={form.bundle_type}
                  onChange={(e) => field("bundle_type", e.target.value)}
                  disabled={loading}
                >
                  {BUNDLE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={LABEL}>Payer</label>
                <select
                  className={SELECT}
                  value={form.payer_id}
                  onChange={(e) => field("payer_id", e.target.value)}
                  disabled={loading}
                >
                  {PAYERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium py-2.5"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Assembling Package…
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4 mr-2" />
                    Assemble Package
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Bundle summary */}
        {bundle ? (
          <Card className="border border-border">
            <CardHeader className="pb-3 pt-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Bundle Summary
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs font-mono">
                    {bundle.bundle_id}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(bundle.assembled_at).toLocaleString()}
                </span>
                {bundle.patient_demographics && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {bundle.patient_demographics.first_name} {bundle.patient_demographics.last_name}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {bundle.total_artifacts} artifact{bundle.total_artifacts !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Score summary */}
              <div className="flex items-center gap-3 mt-2">
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" />{completedCount} Complete
                </span>
                {actionCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                    <AlertTriangle className="w-3 h-3" />{actionCount} Action Required
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="pb-6 space-y-3">
              {/* Checklist */}
              <div className="space-y-2">
                {bundle.submission_checklist.map((item) => (
                  <ChecklistRow key={item.item} item={item} />
                ))}
              </div>

              {/* Disclaimer */}
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                AI-assembled bundle — verify all items in the checklist before payer submission.
              </div>

              {/* Export */}
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleExport}
              >
                <Download className="w-4 h-4 mr-2" />
                Export Bundle (JSON)
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-dashed border-border">
            <CardContent className="p-10 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Package className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Bundle Will Appear Here</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Select a patient and payer, then click Assemble Package to generate a
                payer-ready clinical record bundle with a submission checklist.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent packages table */}
      <Card className="border border-border">
        <CardHeader className="pb-3 pt-5">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Recent Packages
            <button
              onClick={fetchPackages}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${packagesLoading ? "animate-spin" : ""}`} />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          {packagesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading packages…
            </div>
          ) : packages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No packages assembled yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs font-medium text-muted-foreground py-2 pr-4">Bundle ID</th>
                    <th className="text-left text-xs font-medium text-muted-foreground py-2 pr-4">Patient</th>
                    <th className="text-left text-xs font-medium text-muted-foreground py-2 pr-4">Payer</th>
                    <th className="text-left text-xs font-medium text-muted-foreground py-2 pr-4">Type</th>
                    <th className="text-left text-xs font-medium text-muted-foreground py-2 pr-4">Status</th>
                    <th className="text-left text-xs font-medium text-muted-foreground py-2">Assembled At</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((row) => (
                    <tr key={row.bundle_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4 font-mono text-xs text-foreground">{row.bundle_id}</td>
                      <td className="py-2.5 pr-4 text-foreground">{row.patient_name}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{row.payer_name}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{row.bundle_type}</td>
                      <td className="py-2.5 pr-4">
                        <Badge className={`text-[10px] ${
                          row.status === "Ready for Review"
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : "bg-amber-100 text-amber-700 border-amber-200"
                        }`}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-muted-foreground text-xs">
                        {new Date(row.assembled_at).toLocaleDateString("en-US", {
                          month: "short", day: "2-digit", year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* HITL disclaimer */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
        <div>
          <span className="font-semibold">Human-in-the-Loop:</span> All assembled bundles are
          drafts for staff review. Verify every checklist item before submitting to a payer.
          No clinical data is transmitted automatically.
        </div>
      </div>
    </div>
  );
}
