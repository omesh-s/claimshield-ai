"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  FileText,
  Download,
  ShieldCheck,
  PenLine,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { denialApi, demoCaseApi, demoCasesApi, recordsApi } from "@/lib/api";
import type { AppealLetter, DenialEvent } from "@/types";

const DEMO_DENIAL_CASE_ID = "DEMO-001";

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

interface FormState {
  patient_id: string;
  payer_id: string;
  cpt_code: string;
  icd10_code: string;
  denial_reason: string;
  denial_date: string;
}

export default function DenialPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    patient_id: "",
    payer_id: "bcbs_tx",
    cpt_code: "",
    icd10_code: "",
    denial_reason: "",
    denial_date: new Date().toISOString().split("T")[0],
  });
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [seededDenial, setSeededDenial] = useState<DenialEvent | null>(null);
  const [demoLabel, setDemoLabel] = useState<string | null>(null);
  const [appeal, setAppeal] = useState<AppealLetter | null>(null);
  const [letterText, setLetterText] = useState("");
  const [packageLoading, setPackageLoading] = useState(false);
  const [appealsCount, setAppealsCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAppealsCount = useCallback(async () => {
    try {
      const { count } = await denialApi.getAppealsCount();
      setAppealsCount(count);
    } catch {
      setAppealsCount(0);
    }
  }, []);

  useEffect(() => {
    fetchAppealsCount();
  }, [fetchAppealsCount]);

  function field(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function loadDemoDenial() {
    setError(null);
    setAppeal(null);
    setLetterText("");
    setDemoLoading(true);
    try {
      const [denial, detail] = await Promise.all([
        demoCaseApi.getDenial(DEMO_DENIAL_CASE_ID),
        demoCasesApi.get(DEMO_DENIAL_CASE_ID),
      ]);
      setSeededDenial(denial);
      setDemoLabel(detail.label);
      setForm({
        patient_id: detail.order.patient_id,
        payer_id: detail.order.payer_id,
        cpt_code: detail.order.cpt_code,
        icd10_code: detail.order.icd10_codes[0] ?? "",
        denial_reason: denial.denial_reason_text,
        denial_date: denial.denial_date,
      });
      toast.success("Demo denial loaded", {
        description: `${denial.denial_id} — review the draft, then generate appeal.`,
        duration: 4000,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load demo denial.";
      setError(msg);
      toast.error("Demo load failed", { duration: 4000 });
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAppeal(null);

    if (!seededDenial && (!form.patient_id || !form.denial_reason)) {
      setError("Patient ID and Denial Reason are required.");
      return;
    }

    setLoading(true);
    try {
      const denial: DenialEvent = seededDenial ?? {
        denial_id: `DENIAL-${form.patient_id.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        original_order_id: `ORDER-${form.patient_id.toUpperCase()}`,
        denial_date: form.denial_date,
        denial_reason_code: `DENL-MED-NECS-001`,
        denial_reason_text: form.denial_reason,
        denial_category: "medical_necessity",
        payer_reference_number: form.payer_id,
        appeal_deadline: new Date(
          new Date(form.denial_date).getTime() + 30 * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .split("T")[0],
      };

      const result = await denialApi.generateAppeal(denial);
      setAppeal(result);
      setLetterText(result.content);
      toast.success("Appeal letter generated", { duration: 4000 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate appeal letter.";
      setError(msg);
      toast.error("Appeal generation failed", { duration: 4000 });
    } finally {
      setLoading(false);
    }
  }

  async function approveAndPackageAppeal() {
    const denialId = seededDenial?.denial_id ?? appeal?.denial_id;
    if (!letterText.trim()) {
      toast.error("Generate an appeal letter before packaging.");
      return;
    }
    if (!denialId) {
      toast.error("Load a demo denial or generate an appeal with a denial ID first.");
      return;
    }
    if (!form.patient_id || !form.payer_id) {
      toast.error("Patient ID and payer are required.");
      return;
    }

    setPackageLoading(true);
    try {
      await recordsApi.packageAppealRecords({
        patient_id: form.patient_id,
        payer_id: form.payer_id,
        denial_id: denialId,
        appeal_letter_content: letterText,
        order_id: seededDenial?.original_order_id,
        run_id: `appeal-${denialId}`,
      });
      toast.success("Appeal package sent", { duration: 4000 });
      fetchAppealsCount();
      router.push("/records");
    } catch (err) {
      toast.error("Packaging failed", {
        description: err instanceof Error ? err.message : "Unknown error",
        duration: 4000,
      });
    } finally {
      setPackageLoading(false);
    }
  }

  function handleExport() {
    const blob = new Blob([letterText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appeal-${appeal?.appeal_id ?? "letter"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const wordCount = letterText.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="w-full p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Denial &amp; Appeal</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Review payer denials and draft appeal letters for staff approval.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4 flex items-center gap-3">
          <FileText className="w-4 h-4 text-primary" />
          <div>
            <p className="text-xl font-bold text-foreground tabular-nums">
              {appealsCount === null ? "—" : appealsCount}
            </p>
            <p className="text-xs text-muted-foreground">Appeal packages in queue</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <Card className="border border-border">
          <CardHeader className="pb-4 pt-5">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Denial Intake
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-6 space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full border-primary/30 text-primary hover:bg-primary/5"
              onClick={loadDemoDenial}
              disabled={loading || demoLoading}
            >
              {demoLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading DEMO-001…
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Load Template Denial (DEMO-001)
                </>
              )}
            </Button>

            {seededDenial && (
              <div className="rounded-md border border-red-200 bg-red-50/50 p-3 text-xs space-y-2">
                <p className="font-semibold text-red-800">
                  Seeded denial — {demoLabel ?? DEMO_DENIAL_CASE_ID}
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">Denial ID</span>
                    <p className="font-mono text-red-900">{seededDenial.denial_id}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Patient ID</span>
                    <p className="font-mono">{form.patient_id}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Payer ref</span>
                    <p className="font-mono">{seededDenial.payer_reference_number}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">CPT / ICD-10</span>
                    <p className="font-mono">{form.cpt_code} / {form.icd10_code}</p>
                  </div>
                </div>
                <p className="text-[10px] text-red-800/90 line-clamp-3">{seededDenial.denial_reason_text}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Patient ID <span className="text-destructive">*</span></label>
                  <input
                    className={INPUT}
                    placeholder="e.g. 10482736"
                    value={form.patient_id}
                    onChange={(e) => field("patient_id", e.target.value)}
                    disabled={loading}
                  />
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>CPT Code</label>
                  <input
                    className={INPUT}
                    placeholder="e.g. 75571"
                    value={form.cpt_code}
                    onChange={(e) => field("cpt_code", e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className={LABEL}>ICD-10 Code</label>
                  <input
                    className={INPUT}
                    placeholder="e.g. I25.10"
                    value={form.icd10_code}
                    onChange={(e) => field("icd10_code", e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className={LABEL}>Date of Denial</label>
                <input
                  type="date"
                  className={INPUT}
                  value={form.denial_date}
                  onChange={(e) => field("denial_date", e.target.value)}
                  disabled={loading}
                />
              </div>

              <div>
                <label className={LABEL}>Denial Reason <span className="text-destructive">*</span></label>
                <textarea
                  className={`${INPUT} min-h-[100px] resize-y`}
                  placeholder="Describe the payer's denial reason, e.g. 'Not medically necessary — cardiology evaluation documentation not present.'"
                  value={form.denial_reason}
                  onChange={(e) => field("denial_reason", e.target.value)}
                  disabled={loading}
                  rows={4}
                />
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
                    Generating Appeal Letter…
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    {seededDenial ? "Generate Appeal Draft" : "Generate Appeal Draft"}
                  </>
                )}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                Draft only — not submitted to payer until staff approves.
              </p>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {appeal ? (
            <Card className="border border-border">
              <CardHeader className="pb-3 pt-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    Appeal Letter Draft
                  </CardTitle>
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                    {appeal.appeal_id}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pb-6 space-y-4">
                {/* Warning banner */}
                <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    <strong>AI-generated draft</strong> — staff review required before submission to payer.
                  </span>
                </div>

                {/* Editable textarea */}
                <textarea
                  className={`${INPUT} min-h-[280px] resize-y font-mono text-xs leading-relaxed`}
                  value={letterText}
                  onChange={(e) => setLetterText(e.target.value)}
                  rows={14}
                />
                <p className="text-xs text-muted-foreground">{wordCount} words</p>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleExport}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export for Review
                  </Button>
                  <Button
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={approveAndPackageAppeal}
                    disabled={packageLoading || !letterText.trim()}
                  >
                    {packageLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Send Package
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-dashed border-border">
              <CardContent className="p-10 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <PenLine className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">Appeal Letter Will Appear Here</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Load a template denial or enter details, then generate an appeal draft.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

    </div>
  );
}
