"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  FileText,
  CheckCircle2,
  Zap,
  Database,
  Brain,
  PenLine,
  Star,
  Download,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { denialApi, demoCaseApi, demoCasesApi } from "@/lib/api";
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

const WORKFLOW_STEPS = [
  { num: "01", icon: Zap,      label: "Detect",   color: "text-blue-600",   bg: "bg-blue-50" },
  { num: "02", icon: Database, label: "Retrieve",  color: "text-indigo-600", bg: "bg-indigo-50" },
  { num: "03", icon: Brain,    label: "Analyze",   color: "text-violet-600", bg: "bg-violet-50" },
  { num: "04", icon: PenLine,  label: "Draft",     color: "text-emerald-600",bg: "bg-emerald-50" },
  { num: "05", icon: Star,     label: "Score",     color: "text-amber-600",  bg: "bg-amber-50" },
];

const STATS = [
  { value: "320", label: "Appeals Generated", icon: FileText, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
  { value: "~73%", label: "First-Round Overturn Rate", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
  { value: "2.1 Min", label: "Avg. Time Per Appeal", icon: Clock, color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-100" },
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
  const [error, setError] = useState<string | null>(null);

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
    <div className="px-12 py-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-5 h-5 text-primary" />
          <h1 className="text-4xl font-bold text-foreground">Denial &amp; Appeal</h1>
        </div>
        <p className="text-base text-muted-foreground">
          Review denied claims and generate AI-drafted appeal letters.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {STATS.map(({ value, label, icon: Icon, color, bg, border }) => (
          <Card key={label} className={`border ${border}`}>
            <CardContent className="p-6">
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-3xl font-bold text-foreground leading-tight">{value}</p>
              <p className="text-sm font-medium text-muted-foreground mt-1">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <Card className="border border-border">
          <CardHeader className="pb-4 pt-5">
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Denial Details
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Load the seeded DEMO-001 denial or enter details manually. Appeals are drafts for staff review only.
            </p>
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
                  Load Seeded Denial (DEMO-001)
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
                    <Brain className="w-4 h-4 mr-2" />
                    {seededDenial ? "Generate Appeal Draft" : "Generate Appeal Letter"}
                  </>
                )}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                Draft only — not submitted to payer until staff approves.
              </p>
            </form>
          </CardContent>
        </Card>

        {/* Output panel */}
        <div className="space-y-4">
          {/* Workflow steps */}
          <Card className="border border-border">
            <CardContent className="p-5">
              <div className="grid grid-cols-5 gap-2 relative">
                <div className="absolute top-5 left-[10%] right-[10%] h-px bg-border hidden md:block" />
                {WORKFLOW_STEPS.map(({ num, icon: Icon, label, color, bg }) => (
                  <div key={num} className="flex flex-col items-center text-center gap-2 relative">
                    <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center ring-2 ring-background z-10 ${loading ? "animate-pulse" : ""}`}>
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <p className="text-xs font-semibold text-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Appeal letter output */}
          {appeal ? (
            <Card className="border border-border">
              <CardHeader className="pb-3 pt-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <PenLine className="w-4 h-4 text-emerald-600" />
                    AI-Generated Appeal Letter
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
                    onClick={() => toast.success("Bundle approval flow — use the New Order page to package records.", { duration: 5000 })}
                  >
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    Approve &amp; Package Records
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
                  Fill in the denial details and click Generate Appeal Letter. Gemini will draft a
                  clinical appeal citing guideline evidence.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* HITL disclaimer */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
        <div>
          <span className="font-semibold">Human-in-the-Loop:</span> ClaimShield AI never
          auto-submits appeals to a payer. Every generated letter is a draft requiring clinical
          staff review and approval before any payer interaction.
        </div>
      </div>
    </div>
  );
}
