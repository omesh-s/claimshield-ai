"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronRight,
  RefreshCw,
  Zap,
  Database,
  Brain,
  PenLine,
  Star,
  FileText,
  Clock,
  AlertOctagon,
  Info,
  Package,
  CheckSquare,
  Download,
  ShieldAlert,
  RotateCcw,
  Printer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ordersApi, denialApi, demoCaseApi, demoCasesApi, recordsApi } from "@/lib/api";
import {
  buildFilingDeadlineStatus,
  getDemoFilingDeadline,
  serviceDateDaysAgo,
  type FilingDeadlineStatus,
} from "@/lib/filing-deadlines";
import type {
  OrderRequest,
  WorkflowResult,
  GapAnalysisResult,
  ScoringResult,
  PatientImpact,
  CodeMismatchWarning,
  DenialEvent,
  AppealLetter,
  PackagedBundle,
} from "@/types";

// ---------------------------------------------------------------------------
// Styled primitives
// ---------------------------------------------------------------------------
const INPUT = "w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const SELECT = "w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50 disabled:cursor-not-allowed";
const LABEL = "block text-xs font-medium text-muted-foreground mb-1";

const TOAST_OPTS = { duration: 4000 } as const;

// ---------------------------------------------------------------------------
// Demo cases — UI metadata only; orders load from GET /demo-cases/{id}
// ---------------------------------------------------------------------------
interface DemoCaseMeta {
  case_id: string;
  label: string;
  tags: string[];
  tagColors: string[];
  bannerClass: string;
  bannerLabel: string;
}

interface LoadedDemoCase extends DemoCaseMeta {
  patientName: string;
  payer: string;
  clinicalNotes?: string;
}

const DEMO_CASE_META: DemoCaseMeta[] = [
  {
    case_id: "DEMO-001",
    label: "Missing Cardiology Note",
    tags: ["Missing Doc", "Cardiac CTA", "Primary Demo"],
    tagColors: ["bg-red-100 text-red-700", "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700"],
    bannerClass: "bg-blue-50 border-blue-200 text-blue-800",
    bannerLabel: "Primary Demo: Missing Cardiology Note",
  },
  {
    case_id: "DEMO-002",
    label: "Clean Approval",
    tags: ["All Criteria Met", "Cardiac MRI", "Clean"],
    tagColors: ["bg-emerald-100 text-emerald-700", "bg-blue-100 text-blue-700", "bg-gray-100 text-gray-700"],
    bannerClass: "bg-emerald-50 border-emerald-200 text-emerald-800",
    bannerLabel: "Clean Approval Scenario",
  },
  {
    case_id: "DEMO-003",
    label: "Code Mismatch Warning",
    tags: ["Code Mismatch", "Cardiac CTA", "Pneumonia Dx"],
    tagColors: ["bg-red-100 text-red-700", "bg-blue-100 text-blue-700", "bg-amber-100 text-amber-700"],
    bannerClass: "bg-amber-50 border-amber-200 text-amber-800",
    bannerLabel: "Code Mismatch Warning Scenario",
  },
];

const SSE_TIMEOUT_MS = 8 * 60 * 1000;

const PAYER_OPTIONS = [
  { id: "bcbs_tx", label: "BCBS Texas PPO", planType: "commercial" },
  { id: "unitedhealthcare", label: "United Healthcare HMO", planType: "commercial_hmo" },
  { id: "aetna", label: "Aetna PPO", planType: "commercial" },
];

// ---------------------------------------------------------------------------
// Workflow steps
// ---------------------------------------------------------------------------
const STEPS = [
  { key: "detect", label: "Detect", icon: Zap, desc: "PA requirement + code validation" },
  { key: "retrieve", label: "Retrieve", icon: Database, desc: "Payer policy retrieval" },
  { key: "analyze", label: "Analyze", icon: Brain, desc: "Chart vs. criteria gap analysis" },
  { key: "draft", label: "Draft", icon: PenLine, desc: "Justification letter generation" },
  { key: "score", label: "Score", icon: Star, desc: "AI self-score & readiness check" },
];

// ---------------------------------------------------------------------------
// Run state types
// ---------------------------------------------------------------------------
type RunStatus = "idle" | "starting" | "running" | "complete" | "error";

interface StepState {
  status: "pending" | "running" | "complete" | "error";
  elapsedMs?: number;
  data?: Record<string, unknown>;
  startedAt?: number;
}

interface RunState {
  status: RunStatus;
  runId?: string;
  steps: Record<string, StepState>;
  result?: WorkflowResult;
  error?: string;
  totalElapsedMs?: number;
}

function initSteps(): Record<string, StepState> {
  return Object.fromEntries(STEPS.map((s) => [s.key, { status: "pending" }]));
}

// ---------------------------------------------------------------------------
// Circular progress SVG
// ---------------------------------------------------------------------------
function CircularProgress({ pct, color }: { pct: number; color: string }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const dash = Math.min((pct / 100) * circ, circ);
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
      <circle
        cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
      <text x="28" y="33" textAnchor="middle" fontSize="11" fill={color} fontWeight="700">
        {pct}%
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Top progress bar
// ---------------------------------------------------------------------------
function TopProgressBar({ steps, status }: { steps: Record<string, StepState>; status: RunStatus }) {
  if (status === "idle" as string) return null;
  const completed = Object.values(steps).filter((s) => s.status === "complete").length;
  const total = STEPS.length;
  const pct = status === "complete" ? 100 : Math.round((completed / total) * 90);

  return (
    <div className="absolute top-0 left-0 right-0 h-0.5 bg-muted overflow-hidden z-50">
      <div
        className="h-full bg-primary transition-all duration-700 ease-in-out"
        style={{ width: `${pct}%`, opacity: status === "idle" ? 0 : 1 }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkflowTimeline with live elapsed counter
// ---------------------------------------------------------------------------
function WorkflowTimeline({
  steps,
  runState,
  tick,
}: {
  steps: Record<string, StepState>;
  runState: RunStatus;
  tick: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Workflow Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3 space-y-2">
        {STEPS.map((step) => {
          const state = steps[step.key];
          const Icon = step.icon;

          // Live elapsed seconds for running step
          const liveElapsed =
            state.status === "running" && state.startedAt
              ? Math.floor((Date.now() - state.startedAt) / 1000)
              : null;

          return (
            <div key={step.key} className="flex items-center gap-2.5">
              <div className="w-6 shrink-0 flex items-center justify-center">
                {state.status === "running" ? (
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                ) : state.status === "complete" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : state.status === "error" ? (
                  <XCircle className="w-4 h-4 text-red-600" />
                ) : (
                  <Icon className="w-4 h-4 text-muted-foreground/30" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs font-medium ${
                      state.status === "complete" ? "text-foreground"
                        : state.status === "running" ? "text-blue-600"
                        : state.status === "error" ? "text-red-600"
                        : "text-muted-foreground/40"
                    }`}
                  >
                    {step.label}
                  </span>
                  {/* Live counting timer */}
                  {liveElapsed !== null && (
                    <span className="text-[10px] text-blue-500 font-mono tabular-nums">
                      {liveElapsed}s…
                    </span>
                  )}
                  {/* Final elapsed after complete */}
                  {state.status === "complete" && state.elapsedMs && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {(state.elapsedMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  {step.key === "retrieve" && state.status === "complete" && state.data?.cache_hit === true && (
                    <Badge className="text-[9px] h-4 px-1 bg-emerald-100 text-emerald-700 border-emerald-200">
                      Policy cache hit
                    </Badge>
                  )}
                  {state.status === "error" && (
                    <span className="text-[10px] text-red-500">failed</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground/50 truncate">{step.desc}</p>
              </div>
            </div>
          );
        })}
        {runState === "complete" && (
          <div className="mt-2 pt-2 border-t border-border">
            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Workflow complete — awaiting staff review
            </span>
          </div>
        )}
        {runState === "error" && (
          <div className="mt-2 pt-2 border-t border-border">
            <span className="text-xs text-red-600 font-medium flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" />
              Workflow encountered errors — partial results shown
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// PA requirement card
// ---------------------------------------------------------------------------
function PARequirementCard({ result }: { result: WorkflowResult }) {
  const pa = result.pa_requirement;
  if (!pa) return null;
  const required = pa.required ?? false;
  return (
    <Card className={required ? "border-blue-200" : "border-border"}>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">PA Requirement</p>
            <div className="flex items-center gap-2">
              <Badge className={required ? "bg-blue-600 text-white text-xs" : "bg-gray-100 text-gray-600 text-xs border"}>
                {required ? "PA Required" : "PA Not Required"}
              </Badge>
              {pa.is_fallback && (
                <Badge className="bg-amber-100 text-amber-700 text-[10px] border border-amber-200">Local fallback</Badge>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Source</p>
            <p className="text-xs font-medium text-foreground capitalize">{pa.source}</p>
          </div>
        </div>
        {pa.reason && (
          <p className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">{pa.reason}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Policy snippets card
// ---------------------------------------------------------------------------
function PolicySnippetsCard({ result }: { result: WorkflowResult }) {
  const retrieval = result.policy_retrieval;
  if (!retrieval) return null;
  return (
    <Card>
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Payer Policy Snippets
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {retrieval.cache_hit && (
              <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">Cache hit</Badge>
            )}
            <Badge className="text-[10px] bg-muted text-muted-foreground border-border">
              {retrieval.total_retrieved} retrieved
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3 space-y-2">
        {retrieval.chunks.slice(0, 3).map((chunk, i) => (
          <div key={chunk.chunk_id} className="p-2.5 rounded-md bg-muted/50 border border-border space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium text-muted-foreground">
                Chunk {i + 1} · {chunk.source_doc}
              </span>
              <span className={`text-[10px] font-medium ${chunk.source === "keyword_fallback" ? "text-amber-600" : "text-emerald-600"}`}>
                {chunk.similarity_score ? `${(chunk.similarity_score * 100).toFixed(0)}%` : ""}
              </span>
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed line-clamp-2">{chunk.content}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Gap analysis card — with chart citations
// ---------------------------------------------------------------------------
function GapAnalysisCard({ gap }: { gap: GapAnalysisResult }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Gap Analysis
          </CardTitle>
          <div className="flex items-center gap-1">
            <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">
              {gap.met_count} met
            </Badge>
            {gap.missing_count > 0 && (
              <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">
                {gap.missing_count} missing
              </Badge>
            )}
            {gap.ambiguous_count > 0 && (
              <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                {gap.ambiguous_count} unclear
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3 space-y-1.5">
        {gap.criteria_evaluated.map((c) => (
          <div
            key={c.criterion_id}
            className={`flex items-start gap-2 p-2.5 rounded-md ${
              c.status === "met"
                ? "bg-emerald-50 border border-emerald-100"
                : c.status === "missing"
                ? "bg-red-50 border border-red-100"
                : "bg-amber-50 border border-amber-100"
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {c.status === "met" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : c.status === "missing" ? (
                <XCircle className="w-3.5 h-3.5 text-red-600" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium leading-snug text-foreground">{c.criterion_text}</p>

              {/* Chart citation for met criteria */}
              {c.status === "met" && c.evidence_from_notes && (
                <p className="text-[11px] text-emerald-700 mt-1 italic leading-snug">
                  &ldquo;{c.evidence_from_notes.length > 140
                    ? c.evidence_from_notes.slice(0, 140) + "…"
                    : c.evidence_from_notes}&rdquo;
                </p>
              )}

              {/* Action recommendation for missing criteria */}
              {c.status === "missing" && (
                <p className="text-[11px] text-red-700 mt-1 leading-snug">
                  {c.recommendation
                    ? `Action required: ${c.recommendation}`
                    : "This criterion is not documented in the submitted chart. Obtain and attach before submission."}
                </p>
              )}

              {/* Ambiguous */}
              {c.status === "ambiguous" && (
                <p className="text-[11px] text-amber-700 mt-1 leading-snug">
                  {c.recommendation ?? "Documentation is present but may not fully satisfy this criterion. Staff review recommended."}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Overall clinical reasoning */}
        {gap.analyst_summary && (
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Clinical Reasoning</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{gap.analyst_summary}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Patient impact card
// ---------------------------------------------------------------------------
function PatientImpactCard({ impact }: { impact: PatientImpact }) {
  return (
    <Card className="border-blue-100 bg-blue-50/40">
      <CardContent className="pt-3 pb-3">
        <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />Patient Impact
        </p>
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <Clock className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-900"><span className="font-medium">Time saved:</span> {impact.estimated_wait_time_saved}</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-900"><span className="font-medium">Auth risk:</span> {impact.auth_failure_risk}</p>
          </div>
          <div className="flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-900">{impact.patient_note}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Filing deadline widget — uses FILING_DEADLINES as single source of truth
// ---------------------------------------------------------------------------
function FilingDeadlineWidget({ status }: { status: FilingDeadlineStatus }) {
  const { rule, daysRemaining, deadlineDays, status: urgency } = status;
  const colorKey = urgency === "ok" ? "green" : urgency === "warning" ? "amber" : "red";
  const colorMap = {
    green: "bg-emerald-50 border-emerald-200 text-emerald-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    red: "bg-red-50 border-red-200 text-red-800",
  };
  return (
    <Card className={`border ${colorMap[colorKey]}`}>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className={`w-4 h-4 ${colorKey === "green" ? "text-emerald-600" : colorKey === "amber" ? "text-amber-600" : "text-red-600"}`} />
            <div>
              <p className="text-xs font-medium">Filing Deadline</p>
              <p className="text-[10px] text-current/70">{deadlineDays}-day rule · {rule.state}</p>
              <p className="text-[10px] text-current/60 font-mono">
                Svc {status.serviceDate} · Due {status.deadlineDate}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${colorKey === "green" ? "text-emerald-700" : colorKey === "amber" ? "text-amber-700" : "text-red-700"}`}>
              {daysRemaining}
            </p>
            <p className="text-[10px] text-current/70">days left</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Self-score card — circular progress + colored pills
// ---------------------------------------------------------------------------
function ScoreCard({
  scoring,
  onExport,
  draftContent,
  result,
}: {
  scoring: ScoringResult;
  onExport: () => void;
  draftContent: string;
  result?: WorkflowResult;
}) {
  const pct = Math.round(scoring.readiness_score ?? 0);
  const ready = scoring.submission_readiness === "ready";
  const needsRevision = (scoring.submission_readiness as string) === "needs_revision";
  const color = ready ? "#16a34a" : needsRevision ? "#d97706" : "#dc2626";
  const borderClass = ready ? "border-emerald-200" : needsRevision ? "border-amber-200" : "border-red-200";

  return (
    <Card className={borderClass}>
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            AI Self-Score
          </CardTitle>
          <div className="flex items-center gap-2">
            <CircularProgress pct={pct} color={color} />
            <Badge
              className={
                ready
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200 text-xs"
                  : needsRevision
                  ? "bg-amber-100 text-amber-700 border-amber-200 text-xs"
                  : "bg-red-100 text-red-700 border-red-200 text-xs"
              }
            >
              {ready ? "Ready" : needsRevision ? "Needs Revision" : "Not Ready"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3 space-y-1.5">
        {scoring.scores.map((s, i) => (
          <div key={i} className="flex items-start gap-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 mt-0.5 ${
                s.score === "pass"
                  ? "bg-emerald-100 text-emerald-700"
                  : s.score === "flag"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {s.score}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground leading-snug">{s.criterion_text}</p>
              {s.rationale && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.rationale}</p>
              )}
            </div>
          </div>
        ))}
        {scoring.reviewer_notes && (
          <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
            {scoring.reviewer_notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Denial card
// ---------------------------------------------------------------------------
function DenialCard({
  denial,
  patientId,
  payerLabel,
  cptCode,
}: {
  denial: DenialEvent;
  patientId?: string;
  payerLabel?: string;
  cptCode?: string;
}) {
  return (
    <Card className="border-red-200 bg-red-50/30">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-xs font-semibold text-red-700 uppercase tracking-wide flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5" />Payer Denial Received
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3 space-y-2">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground text-[10px]">Denial ID</p>
            <p className="font-mono font-medium text-red-800 text-[11px]">{denial.denial_id}</p>
          </div>
          {patientId && (
            <div>
              <p className="text-muted-foreground text-[10px]">Patient ID</p>
              <p className="font-mono font-medium text-foreground text-[11px]">{patientId}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-[10px]">Denial Date</p>
            <p className="font-medium text-foreground">{denial.denial_date}</p>
          </div>
          {payerLabel && (
            <div>
              <p className="text-muted-foreground text-[10px]">Payer</p>
              <p className="font-medium text-foreground text-[11px]">{payerLabel}</p>
            </div>
          )}
          {cptCode && (
            <div>
              <p className="text-muted-foreground text-[10px]">CPT</p>
              <p className="font-mono font-medium text-foreground text-[11px]">{cptCode}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-[10px]">Category</p>
            <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200 mt-0.5">
              {denial.denial_category.replace(/_/g, " ")}
            </Badge>
          </div>
          <div>
            <p className="text-muted-foreground text-[10px]">Appeal Deadline</p>
            <p className="text-xs font-semibold text-amber-700">
              {denial.appeal_deadline ?? "60 days from denial"}
            </p>
          </div>
        </div>
        <div className="p-2 rounded bg-red-100/60 border border-red-200">
          <p className="text-[10px] text-red-800 leading-relaxed line-clamp-3">{denial.denial_reason_text}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Printable view — rendered off-screen, displayed on window.print()
// ---------------------------------------------------------------------------
function PrintableReport({
  result,
  draftContent,
  patientId,
  payerId,
}: {
  result: WorkflowResult;
  draftContent: string;
  patientId: string;
  payerId: string;
}) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return (
    <div id="printable-report" className="hidden print:block font-sans text-sm text-black bg-white p-8">
      <div className="border-b-2 border-black pb-3 mb-5">
        <h1 className="text-xl font-bold">ClaimShield AI — Prior Authorization Submission Package</h1>
        <p className="text-sm mt-1">Generated: {date} · Patient: {patientId} · Payer: {payerId} · Human review required before payer submission.</p>
      </div>

      {/* PA Requirement */}
      {result.pa_requirement && (
        <section className="mb-5">
          <h2 className="text-base font-bold border-b border-gray-300 pb-1 mb-2">PA Requirement Check</h2>
          <p><strong>Status:</strong> {result.pa_requirement.required ? "PA Required" : "PA Not Required"} · <strong>Source:</strong> {result.pa_requirement.source}</p>
          {result.pa_requirement.reason && <p className="mt-1">{result.pa_requirement.reason}</p>}
        </section>
      )}

      {/* Gap Analysis */}
      {result.gap_analysis && (
        <section className="mb-5">
          <h2 className="text-base font-bold border-b border-gray-300 pb-1 mb-2">
            Gap Analysis — {result.gap_analysis.met_count} Met · {result.gap_analysis.missing_count} Missing · {result.gap_analysis.ambiguous_count} Unclear
          </h2>
          {result.gap_analysis.criteria_evaluated.map((c, i) => (
            <div key={i} className="mb-2 pl-3 border-l-2" style={{ borderColor: c.status === "met" ? "#16a34a" : c.status === "missing" ? "#dc2626" : "#d97706" }}>
              <p><strong>[{c.status.toUpperCase()}]</strong> {c.criterion_text}</p>
              {c.status === "met" && c.evidence_from_notes && (
                <p className="text-xs italic mt-0.5">&ldquo;{c.evidence_from_notes}&rdquo;</p>
              )}
              {c.status === "missing" && c.recommendation && (
                <p className="text-xs mt-0.5">Action: {c.recommendation}</p>
              )}
            </div>
          ))}
          {result.gap_analysis.analyst_summary && (
            <p className="mt-2 text-xs">{result.gap_analysis.analyst_summary}</p>
          )}
        </section>
      )}

      {/* Draft Letter */}
      {draftContent && (
        <section className="mb-5">
          <h2 className="text-base font-bold border-b border-gray-300 pb-1 mb-2">Prior Authorization Justification Letter (Draft)</h2>
          <pre className="whitespace-pre-wrap text-xs font-sans leading-relaxed">{draftContent}</pre>
        </section>
      )}

      {/* Self-Score */}
      {result.scoring && (
        <section className="mb-5">
          <h2 className="text-base font-bold border-b border-gray-300 pb-1 mb-2">
            AI Self-Score — {Math.round(result.scoring.readiness_score)}% Readiness · {result.scoring.submission_readiness.replace(/_/g, " ")}
          </h2>
          {result.scoring.scores.map((s, i) => (
            <div key={i} className="mb-1.5">
              <p><strong>[{s.score.toUpperCase()}]</strong> {s.criterion_text}</p>
              {s.rationale && <p className="text-xs ml-4">{s.rationale}</p>}
            </div>
          ))}
        </section>
      )}

      <div className="border-t border-gray-300 pt-3 mt-5 text-xs text-gray-500">
        <p>⚠ This is an AI-generated draft. Do not submit to payer without clinical staff review and approval.</p>
        <p className="mt-0.5">ClaimShield AI MVP v0.1 · Human-in-the-loop: all outputs require staff sign-off.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------
export default function OrderPage() {
  const router = useRouter();
  const [form, setForm] = useState<Partial<OrderRequest>>({ payer_id: "", plan_type: "", icd10_codes: [] });
  const [icd10Input, setIcd10Input] = useState("");
  const [loadedCase, setLoadedCase] = useState<LoadedDemoCase | null>(null);
  const [demoLoadId, setDemoLoadId] = useState<string | null>(null);

  const [runState, setRunState] = useState<RunState>({ status: "idle", steps: initSteps() });
  const stepTimings = useRef<Record<string, number>>({});
  const streamAbortRef = useRef<AbortController | null>(null);
  const [workflowHeartbeat, setWorkflowHeartbeat] = useState(false);
  const [liveScoring, setLiveScoring] = useState<ScoringResult | null>(null);

  // Tick for live elapsed counter — re-renders every second while running
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const [draftContent, setDraftContent] = useState("");
  const [showRevisionField, setShowRevisionField] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [approved, setApproved] = useState(false);
  const [activeTab, setActiveTab] = useState("justification");

  const [denialEvent, setDenialEvent] = useState<DenialEvent | null>(null);
  const [denialLoading, setDenialLoading] = useState(false);
  const [appealLetter, setAppealLetter] = useState<AppealLetter | null>(null);
  const [appealLetterText, setAppealLetterText] = useState("");
  const [appealLoading, setAppealLoading] = useState(false);
  const [packagedBundle, setPackagedBundle] = useState<PackagedBundle | null>(null);
  const [packageLoading, setPackageLoading] = useState(false);

  const [showDemoModal, setShowDemoModal] = useState(false);
  const [showMismatchModal, setShowMismatchModal] = useState(false);
  const [pendingMismatch, setPendingMismatch] = useState<CodeMismatchWarning | null>(null);

  const filingDeadlineStatus = useMemo((): FilingDeadlineStatus | null => {
    if (!form.payer_id) return null;
    if (loadedCase?.case_id) {
      const demo = getDemoFilingDeadline(loadedCase.case_id);
      if (demo) return demo;
    }
    return buildFilingDeadlineStatus(form.payer_id, serviceDateDaysAgo(0));
  }, [form.payer_id, loadedCase?.case_id]);

  const setField = (key: keyof OrderRequest, value: string) => {
    if (key === "payer_id") {
      const payer = PAYER_OPTIONS.find((p) => p.id === value);
      setForm((f) => ({ ...f, payer_id: value, plan_type: payer?.planType ?? "" }));
    } else {
      setForm((f) => ({ ...f, [key]: value }));
    }
  };

  const loadDemoCase = async (caseId: string) => {
    const meta = DEMO_CASE_META.find((d) => d.case_id === caseId);
    if (!meta) return;
    setDemoLoadId(caseId);
    try {
      const detail = await demoCasesApi.get(caseId);
      setForm(detail.order);
      setIcd10Input(detail.order.icd10_codes.join(", "));
      setLoadedCase({
        ...meta,
        patientName: detail.patient_name,
        payer: detail.payer_display,
        clinicalNotes: detail.order.clinical_notes,
      });
      setShowDemoModal(false);
      toast.success("Demo case loaded", {
        description: `${detail.label} — click Submit to run the workflow.`,
        ...TOAST_OPTS,
      });
    } catch (err) {
      toast.error("Failed to load demo case", {
        description: err instanceof Error ? err.message : "Unknown error",
        ...TOAST_OPTS,
      });
    } finally {
      setDemoLoadId(null);
    }
  };

  const resetWorkspace = () => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setWorkflowHeartbeat(false);
    setLiveScoring(null);
    setRunState({ status: "idle", steps: initSteps() });
    setDraftContent("");
    setShowRevisionField(false);
    setRevisionNotes("");
    setApproved(false);
    setActiveTab("justification");
    setPendingMismatch(null);
    setDenialEvent(null);
    setAppealLetter(null);
    setAppealLetterText("");
    setPackagedBundle(null);
    setForm({ payer_id: "", plan_type: "", icd10_codes: [] });
    setIcd10Input("");
    setLoadedCase(null);
  };

  const triggerMockDenial = async () => {
    const caseId = loadedCase?.case_id ?? "DEMO-001";
    setDenialLoading(true);
    try {
      const denial = await demoCaseApi.getDenial(caseId);
      setDenialEvent(denial);
      toast.error("Denial received", {
        description: `${denial.denial_reason_code} — ${denial.denial_category.replace(/_/g, " ")}`,
        ...TOAST_OPTS,
      });
      setAppealLoading(true);
      setActiveTab("appeal");
      toast.info("Generating appeal letter…", {
        description: "Gemini is drafting your appeal citing ACC/AHA 2021 guidelines.",
        ...TOAST_OPTS,
      });
      try {
        const appeal = await denialApi.generateAppeal(denial);
        setAppealLetter(appeal);
        setAppealLetterText(appeal.content);
        toast.success("Appeal draft ready", {
          description: `${appeal.word_count} words — review before submission.`,
          ...TOAST_OPTS,
        });
      } catch (appealErr) {
        toast.error("Appeal generation failed", {
          description: appealErr instanceof Error ? appealErr.message : "Unknown error",
          ...TOAST_OPTS,
        });
      } finally {
        setAppealLoading(false);
      }
    } catch (err) {
      toast.error("Failed to fetch denial", {
        description: err instanceof Error ? err.message : "Unknown error",
        ...TOAST_OPTS,
      });
    } finally {
      setDenialLoading(false);
    }
  };

  const approveAndPackageAppeal = async () => {
    if (!appealLetter || !denialEvent || !appealLetterText.trim()) {
      toast.error("Generate an appeal letter before packaging.", TOAST_OPTS);
      return;
    }
    if (!form.patient_id || !form.payer_id) {
      toast.error("Patient and payer are required on the order.", TOAST_OPTS);
      return;
    }

    setPackageLoading(true);
    try {
      await recordsApi.packageAppealRecords({
        patient_id: form.patient_id,
        payer_id: form.payer_id,
        denial_id: denialEvent.denial_id,
        appeal_letter_content: appealLetterText,
        order_id: denialEvent.original_order_id,
        run_id: runState.runId ?? `appeal-${denialEvent.denial_id}`,
      });
      toast.success("Appeal package assembled — ready for review", TOAST_OPTS);
      router.push("/records");
    } catch (err) {
      toast.error("Packaging failed", {
        description: err instanceof Error ? err.message : "Unknown error",
        ...TOAST_OPTS,
      });
    } finally {
      setPackageLoading(false);
    }
  };

  const approveAndPackage = async () => {
    setApproved(true);
    setPackageLoading(true);
    setActiveTab("records");
    toast.success("Draft approved", { description: "Assembling clinical record bundle…", ...TOAST_OPTS });
    try {
      const bundle = await recordsApi.packageRecords({
        run_id: runState.runId ?? "unknown",
        patient_id: form.patient_id ?? loadedCase?.case_id ?? "DEMO-001",
        order_id: runState.runId ?? "unknown",
        payer_id: form.payer_id ?? "bcbs_tx",
        staff_approved: true,
      });
      setPackagedBundle(bundle);
      toast.success("Records packaged", {
        description: `${bundle.total_artifacts} artifacts assembled — view in Record Packages.`,
        action: {
          label: "View Records",
          onClick: () => router.push("/records"),
        },
        ...TOAST_OPTS,
      });
      router.push("/records");
    } catch (err) {
      toast.error("Packaging failed", {
        description: err instanceof Error ? err.message : "Unknown error",
        ...TOAST_OPTS,
      });
    } finally {
      setPackageLoading(false);
    }
  };

  const downloadBundle = () => {
    if (!packagedBundle) return;
    const blob = new Blob([JSON.stringify(packagedBundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `claimshield-bundle-${packagedBundle.bundle_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Bundle downloaded", TOAST_OPTS);
  };

  const handleExportForReview = () => {
    window.print();
  };

  const submitOrder = useCallback(async () => {
    const icd10s = icd10Input.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    const order: OrderRequest = {
      patient_id: form.patient_id ?? "",
      payer_id: form.payer_id ?? "",
      plan_type: form.plan_type ?? "",
      cpt_code: form.cpt_code ?? "",
      procedure_description: form.procedure_description ?? "",
      icd10_codes: icd10s,
      ordering_provider_npi: form.ordering_provider_npi ?? "0000000000",
      ordering_provider_name: form.ordering_provider_name ?? "Unknown Provider",
    };

    if (!order.patient_id || !order.payer_id || !order.cpt_code || icd10s.length === 0) {
      toast.error("Please fill in all required fields.", TOAST_OPTS);
      return;
    }

    streamAbortRef.current?.abort();
    const abortController = new AbortController();
    streamAbortRef.current = abortController;
    const timeoutId = setTimeout(() => abortController.abort(), SSE_TIMEOUT_MS);

    setRunState({ status: "starting", steps: initSteps() });
    setDraftContent("");
    setDenialEvent(null);
    setAppealLetter(null);
    setAppealLetterText("");
    setPackagedBundle(null);
    setApproved(false);
    setActiveTab("justification");
    setWorkflowHeartbeat(false);
    setLiveScoring(null);

    toast.info("Workflow started", {
      description: `Processing ${order.cpt_code} for ${PAYER_OPTIONS.find((p) => p.id === order.payer_id)?.label ?? order.payer_id}…`,
      ...TOAST_OPTS,
    });

    const STEP_TOASTS: Record<string, string> = {
      detect: "PA requirement detected",
      retrieve: "Policy retrieved",
      analyze: "Gap analysis complete",
      draft: "Draft letter ready",
      score: "Quality review complete",
    };

    try {
      const stream = ordersApi.processStream(order, abortController.signal);
      for await (const event of stream) {
        if (event.event === "heartbeat") {
          setWorkflowHeartbeat(true);
          continue;
        }
        if (event.event === "started") {
          setRunState((s) => ({ ...s, status: "running", runId: event.run_id }));
        } else if (event.event === "step_update") {
          const stepKey = event.current_state ?? "";
          const now = Date.now();

          if (event.status === "running") {
            stepTimings.current[stepKey] = now;
            setRunState((s) => ({
              ...s,
              steps: { ...s.steps, [stepKey]: { status: "running", startedAt: now, data: event.data as Record<string, unknown> } },
            }));
          } else if (event.status === "complete") {
            const elapsed = now - (stepTimings.current[stepKey] ?? now);
            if (stepKey === "detect" && event.data?.code_mismatch === true) {
              setPendingMismatch({ detected: true, cpt_code: order.cpt_code, icd10_codes: order.icd10_codes, warning_message: "" });
              setShowMismatchModal(true);
            }
            if (STEP_TOASTS[stepKey]) {
              toast.success(STEP_TOASTS[stepKey], TOAST_OPTS);
            }
            if (stepKey === "score" && event.data?.readiness_score != null) {
              const d = event.data;
              setLiveScoring({
                readiness_score: d.readiness_score ?? 0,
                pass_count: d.pass ?? 0,
                flag_count: d.flag ?? 0,
                fail_count: d.fail ?? 0,
                submission_readiness:
                  d.fail && d.fail > 0
                    ? "not_ready"
                    : d.recommendation === "ready_for_review"
                    ? "ready"
                    : "needs_review",
                scores: [],
                reviewer_notes: "Score step complete — full breakdown loading…",
              });
            }
            setRunState((s) => ({
              ...s,
              steps: { ...s.steps, [stepKey]: { status: "complete", elapsedMs: elapsed, data: event.data as Record<string, unknown> } },
            }));
          } else if (event.status === "error") {
            setRunState((s) => ({
              ...s,
              steps: { ...s.steps, [stepKey]: { status: "error", data: event.data as Record<string, unknown> } },
            }));
          }
        } else if (event.event === "pa_not_required") {
          toast.success(event.message ?? "PA not required for this order.", TOAST_OPTS);
        } else if (event.event === "complete") {
          const result = event.result;
          if (result) {
            setDraftContent(result.draft?.justification_letter?.content ?? "");
            if (result.scoring) setLiveScoring(result.scoring);
            if (result.code_mismatch_warning?.detected) {
              setPendingMismatch(result.code_mismatch_warning);
              setShowMismatchModal(true);
            }
          }
          setRunState((s) => ({ ...s, status: "complete", result, totalElapsedMs: event.elapsed_ms }));
          toast.success("Workflow complete", {
            description: "AI draft is ready for staff review.",
            ...TOAST_OPTS,
          });
        } else if (event.event === "error") {
          setRunState((s) => ({ ...s, status: "error", error: event.message ?? "Workflow error" }));
          toast.error("Workflow error", { description: event.message, ...TOAST_OPTS });
        }
      }
    } catch (err) {
      const aborted = abortController.signal.aborted;
      const msg = aborted
        ? "Workflow timed out after 8 minutes. Try again or use the sync endpoint fallback."
        : err instanceof Error
        ? err.message
        : "Unknown error";
      setRunState((s) => ({ ...s, status: "error", error: msg }));
      toast.error(aborted ? "Workflow timed out" : "Request failed", { description: msg, ...TOAST_OPTS });
    } finally {
      clearTimeout(timeoutId);
      streamAbortRef.current = null;
      setWorkflowHeartbeat(false);
    }
  }, [form, icd10Input]);

  const result = runState.result;
  const displayScoring = result?.scoring ?? liveScoring;
  const hasWorkflowErrors = result?.errors && Object.keys(result.errors).length > 0;
  const isRunning = runState.status === "starting" || runState.status === "running";
  const isComplete = runState.status === "complete";
  const hasError = runState.status === "error";
  const showResults = isRunning || isComplete || hasError;

  return (
    <>
      {/* Printable report (off-screen, becomes visible only during print) */}
      {result && (
        <PrintableReport
          result={result}
          draftContent={draftContent}
          patientId={form.patient_id ?? ""}
          payerId={form.payer_id ?? ""}
        />
      )}

      {/* Demo case selector modal */}
      <Dialog open={showDemoModal} onOpenChange={setShowDemoModal}>
        <DialogContent className="max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Load Demo Case
            </DialogTitle>
            <DialogDescription>Select a pre-seeded scenario to load into the order form.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            {DEMO_CASE_META.map((demo) => (
              <div
                key={demo.case_id}
                className="p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/30 transition-all cursor-pointer"
                onClick={() => loadDemoCase(demo.case_id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-medium text-foreground">{demo.label}</span>
                      <span className="text-[10px] text-muted-foreground">· {demo.case_id}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {demo.tags.map((tag, i) => (
                        <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${demo.tagColors[i]}`}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="text-xs shrink-0"
                    disabled={demoLoadId === demo.case_id || isRunning}
                    onClick={(e) => { e.stopPropagation(); loadDemoCase(demo.case_id); }}
                  >
                    {demoLoadId === demo.case_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <>Load <ChevronRight className="w-3 h-3" /></>}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Code mismatch modal */}
      <Dialog open={showMismatchModal} onOpenChange={(open) => { if (!open) setShowMismatchModal(false); }}>
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5 text-red-600" />
              </div>
              <DialogTitle className="text-red-700">Unusual Code Pairing Detected</DialogTitle>
            </div>
            <DialogDescription>
              {pendingMismatch?.warning_message ||
                "The procedure code does not align with the documented diagnosis codes. Please confirm before proceeding."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <div className="p-2.5 rounded-md bg-red-50 border border-red-100 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">CPT Code</span>
                <Badge className="bg-red-100 text-red-700 border-red-200 text-xs font-mono">{pendingMismatch?.cpt_code}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">ICD-10</span>
                <div className="flex gap-1 flex-wrap">
                  {(pendingMismatch?.icd10_codes ?? []).map((code) => (
                    <Badge key={code} className="bg-red-100 text-red-700 border-red-200 text-xs font-mono">{code}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Staff must review and confirm before the letter is finalized. The workflow continues in the
              background while this dialog is open — closing it does not stop processing.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowMismatchModal(false); resetWorkspace(); }}>
              Go Back and Edit Order
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setShowMismatchModal(false)}>
              Confirm and Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Main layout ── */}
      <div className="flex flex-col h-full relative">
        {/* Animated progress bar */}
        <TopProgressBar steps={runState.steps} status={runState.status} />

        <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-card">
          <div>
            <h1 className="text-base font-semibold text-foreground">New Prior Authorization</h1>
            <p className="text-xs text-muted-foreground">
              Submit an order to run the AI workflow — results require staff review before payer submission.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showResults && (
              <Button variant="outline" size="sm" onClick={resetWorkspace} className="text-xs gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />Reset Workspace
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* ── Left column 42% ── */}
          <div className="w-[42%] shrink-0 overflow-y-auto border-r border-border p-4 space-y-3">
            {/* Scenario banner */}
            {loadedCase && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${loadedCase.bannerClass}`}>
                <FileText className="w-3.5 h-3.5 shrink-0" />
                {loadedCase.bannerLabel}
                <span className="ml-auto text-[10px] opacity-70">{loadedCase.case_id}</span>
              </div>
            )}

            {loadedCase?.clinicalNotes && (
              <Card>
                <CardHeader className="pb-1 pt-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Clinical Notes (preview)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                    {loadedCase.clinicalNotes}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Order form */}
            <Card>
              <CardHeader className="pb-2 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Order Entry</CardTitle>
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setShowDemoModal(true)} disabled={isRunning}>
                    <FileText className="w-3 h-3" />Load Demo Case
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pb-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL}>Patient ID *</label>
                    <input className={INPUT} placeholder="10482736" value={form.patient_id ?? ""} onChange={(e) => setField("patient_id", e.target.value)} disabled={isRunning} />
                  </div>
                  <div>
                    <label className={LABEL}>CPT Code *</label>
                    <input className={INPUT} placeholder="75571" value={form.cpt_code ?? ""} onChange={(e) => setField("cpt_code", e.target.value)} disabled={isRunning} />
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Payer *</label>
                  <select className={SELECT} value={form.payer_id ?? ""} onChange={(e) => setField("payer_id", e.target.value)} disabled={isRunning}>
                    <option value="">Select payer…</option>
                    {PAYER_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Plan Type</label>
                  <select className={SELECT} value={form.plan_type ?? ""} onChange={(e) => setField("plan_type", e.target.value)} disabled={isRunning}>
                    <option value="">Select plan type…</option>
                    <option value="commercial">Commercial PPO</option>
                    <option value="commercial_hmo">Commercial HMO</option>
                    <option value="medicare">Medicare</option>
                    <option value="medicaid">Medicaid</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Procedure Description</label>
                  <input className={INPUT} placeholder="CT angiography of the heart" value={form.procedure_description ?? ""} onChange={(e) => setField("procedure_description", e.target.value)} disabled={isRunning} />
                </div>
                <div>
                  <label className={LABEL}>ICD-10 Codes * (comma-separated)</label>
                  <input className={INPUT} placeholder="I25.10" value={icd10Input} onChange={(e) => setIcd10Input(e.target.value)} disabled={isRunning} />
                </div>
                <div>
                  <label className={LABEL}>Ordering Provider</label>
                  <input className={INPUT} placeholder="Dr. Sarah Chen" value={form.ordering_provider_name ?? ""} onChange={(e) => setField("ordering_provider_name", e.target.value)} disabled={isRunning} />
                </div>
                <Button className="w-full gap-1.5" onClick={submitOrder} disabled={isRunning}>
                  {isRunning
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Running workflow…</>
                    : <><Zap className="w-4 h-4" />Submit for Prior Authorization</>}
                </Button>
              </CardContent>
            </Card>

            {/* Error */}
            {hasError && runState.error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-red-700">Workflow error</p>
                  <p className="text-xs text-red-600 mt-0.5">{runState.error}</p>
                </div>
                <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={submitOrder}>
                  <RefreshCw className="w-3 h-3" />Retry
                </Button>
              </div>
            )}

            {/* Workflow timeline */}
            {showResults && (
              <>
                {workflowHeartbeat && isRunning && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Still processing — long-running AI steps in progress…
                  </p>
                )}
                <WorkflowTimeline steps={runState.steps} runState={runState.status} tick={tick} />
              </>
            )}

            {/* PA requirement skeleton/card */}
            {isRunning && !result?.pa_requirement && (
              <Card><CardContent className="pt-3 pb-3 space-y-2"><Skeleton className="h-3 w-32" /><Skeleton className="h-6 w-24" /><Skeleton className="h-3 w-48" /></CardContent></Card>
            )}
            {result?.pa_requirement && <PARequirementCard result={result} />}

            {/* Policy snippets skeleton/card */}
            {isRunning && (runState.steps["retrieve"]?.status === "running" || runState.steps["retrieve"]?.status === "complete") && !result?.policy_retrieval && (
              <Card><CardContent className="pt-3 pb-3 space-y-2"><Skeleton className="h-3 w-40" />{[1, 2, 3].map((i) => <div key={i} className="p-2.5 rounded-md bg-muted/30 space-y-1"><Skeleton className="h-2 w-32" /><Skeleton className="h-3 w-full" /></div>)}</CardContent></Card>
            )}
            {result?.policy_retrieval && <PolicySnippetsCard result={result} />}

            {/* Gap analysis skeleton/card */}
            {isRunning && runState.steps["analyze"]?.status === "running" && !result?.gap_analysis && (
              <Card><CardContent className="pt-3 pb-3 space-y-2"><Skeleton className="h-3 w-36" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}</CardContent></Card>
            )}
            {result?.gap_analysis && <GapAnalysisCard gap={result.gap_analysis} />}

            {result?.patient_impact && <PatientImpactCard impact={result.patient_impact} />}
            {(isRunning || isComplete) && filingDeadlineStatus && (
              <FilingDeadlineWidget status={filingDeadlineStatus} />
            )}

            {/* Denial card */}
            {denialEvent && (
              <DenialCard
                denial={denialEvent}
                patientId={form.patient_id}
                payerLabel={loadedCase?.payer}
                cptCode={form.cpt_code}
              />
            )}

            {/* Trigger mock denial */}
            {approved && !denialEvent && (
              <Button
                variant="outline"
                className="w-full gap-1.5 border-red-200 text-red-700 hover:bg-red-50"
                onClick={triggerMockDenial}
                disabled={denialLoading}
              >
                {denialLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Fetching denial…</>
                  : <><ShieldAlert className="w-4 h-4" />Trigger Mock Denial</>}
              </Button>
            )}
          </div>

          {/* ── Right column 60% ── */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!showResults && (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Brain className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Ready for your order</p>
                  <p className="text-xs text-muted-foreground mt-0.5 max-w-xs">
                    Fill in the form and click Submit, or use Load Demo Case for a quick start.
                  </p>
                </div>
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => setShowDemoModal(true)} disabled={isRunning}>
                  <FileText className="w-3.5 h-3.5" />Load Demo Case
                </Button>
              </div>
            )}

            {hasWorkflowErrors && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">AI-assisted draft — manual review required.</span>{" "}
                  One or more workflow steps used fallback output (
                  {Object.keys(result?.errors ?? {}).join(", ")}).
                </p>
              </div>
            )}

            {showResults && (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-3">
                  <TabsTrigger value="justification">Justification Letter</TabsTrigger>
                  <TabsTrigger value="appeal"
                    aria-disabled={!approved}
                    style={{ opacity: approved ? 1 : 0.4, pointerEvents: approved ? "auto" : "none" }}>
                    Appeal Letter
                  </TabsTrigger>
                  <TabsTrigger value="records"
                    aria-disabled={!packagedBundle}
                    style={{ opacity: packagedBundle ? 1 : 0.4, pointerEvents: packagedBundle ? "auto" : "none" }}>
                    Packaged Records
                  </TabsTrigger>
                </TabsList>

                {/* ── Justification Letter ── */}
                <TabsContent value="justification">
                  <div className="space-y-3">
                    {isRunning && !displayScoring && runState.steps["score"]?.status !== "complete" && (
                      <Card><CardContent className="pt-3 pb-3 space-y-2"><div className="flex items-center justify-between"><Skeleton className="h-3 w-24" /><Skeleton className="h-6 w-16" /></div>{[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full rounded" />)}</CardContent></Card>
                    )}
                    {displayScoring && (
                      <ScoreCard
                        scoring={displayScoring}
                        onExport={handleExportForReview}
                        draftContent={draftContent}
                        result={result}
                      />
                    )}

                    {(isRunning || isComplete) && (
                      <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-800">
                          <span className="font-semibold">AI-generated draft.</span> Staff review required before submission to payer. Edit directly below.
                        </p>
                      </div>
                    )}

                    {isRunning && !draftContent && (
                      <Card><CardContent className="pt-3 pb-3 space-y-1.5"><Skeleton className="h-3 w-1/3" />{Array.from({ length: 14 }).map((_, i) => <Skeleton key={i} className="h-3" style={{ width: `${70 + Math.random() * 28}%` }} />)}</CardContent></Card>
                    )}

                    {(draftContent || isComplete) && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-muted-foreground">Justification Letter Draft</label>
                          {draftContent && (
                            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handleExportForReview}>
                              <Printer className="w-3.5 h-3.5" />Export for Review
                            </Button>
                          )}
                        </div>
                        <textarea
                          className={`${INPUT} min-h-[340px] font-mono text-xs leading-relaxed resize-y`}
                          value={draftContent}
                          onChange={(e) => setDraftContent(e.target.value)}
                          placeholder="AI-generated letter will appear here…"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          {draftContent.split(/\s+/).filter(Boolean).length} words · editable
                        </p>
                      </div>
                    )}

                    {showRevisionField && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Revision Notes</label>
                        <textarea className={`${INPUT} min-h-[80px] resize-y`} placeholder="Describe what needs to change…" value={revisionNotes} onChange={(e) => setRevisionNotes(e.target.value)} />
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowRevisionField(false)}>Cancel</Button>
                      </div>
                    )}

                    {isComplete && draftContent && !approved && (
                      <div className="flex gap-2 pt-1">
                        <Button className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={approveAndPackage} disabled={packageLoading}>
                          {packageLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Packaging…</> : <><Package className="w-4 h-4" />Approve and Package Records</>}
                        </Button>
                        <Button variant="outline" className="flex-1 gap-1.5" onClick={() => { setDraftContent(""); setShowRevisionField(true); }}>
                          <RefreshCw className="w-4 h-4" />Request Revision
                        </Button>
                      </div>
                    )}

                    {approved && (
                      <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-50 border border-emerald-200">
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                        <p className="text-xs text-emerald-800 font-medium">
                          Draft approved. Use &ldquo;Trigger Mock Denial&rdquo; in the left panel to simulate a payer denial and generate an appeal letter.
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* ── Appeal Letter ── */}
                <TabsContent value="appeal">
                  {appealLoading && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 rounded-md bg-blue-50 border border-blue-200">
                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        <p className="text-xs text-blue-800">Gemini is drafting the appeal letter citing ACC/AHA 2021 guidelines…</p>
                      </div>
                      <Card><CardContent className="pt-3 pb-3 space-y-1.5">{Array.from({ length: 16 }).map((_, i) => <Skeleton key={i} className="h-3" style={{ width: `${65 + Math.random() * 33}%` }} />)}</CardContent></Card>
                    </div>
                  )}
                  {appealLetter && !appealLoading && (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-800">
                          <span className="font-semibold">AI-generated appeal draft.</span> Verify all guideline citations before submission.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-muted-foreground">Appeal Letter Draft</label>
                          <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">{appealLetter.word_count} words</Badge>
                        </div>
                        <textarea
                          className={`${INPUT} min-h-[400px] font-mono text-xs leading-relaxed resize-y`}
                          value={appealLetterText}
                          onChange={(e) => setAppealLetterText(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={approveAndPackageAppeal}
                          disabled={packageLoading}
                        >
                          {packageLoading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" />Packaging…</>
                          ) : (
                            <><Package className="w-4 h-4" />Approve &amp; Package Records</>
                          )}
                        </Button>
                        <Button variant="outline" className="flex-1 gap-1.5" onClick={() => { setAppealLetter(null); setAppealLetterText(""); }}>
                          <RefreshCw className="w-4 h-4" />Regenerate
                        </Button>
                      </div>
                    </div>
                  )}
                  {!appealLoading && !appealLetter && (
                    <div className="flex flex-col items-center justify-center min-h-[300px] text-center gap-2">
                      <ShieldAlert className="w-8 h-8 text-muted-foreground/30" />
                      <p className="text-sm font-medium text-muted-foreground">Appeal Letter</p>
                      <p className="text-xs text-muted-foreground max-w-xs">Click &ldquo;Trigger Mock Denial&rdquo; after approving the PA letter to generate an appeal.</p>
                    </div>
                  )}
                </TabsContent>

                {/* ── Packaged Records ── */}
                <TabsContent value="records">
                  {packageLoading && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-3 rounded-md bg-blue-50 border border-blue-200">
                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        <p className="text-xs text-blue-800">Assembling clinical record bundle…</p>
                      </div>
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
                    </div>
                  )}
                  {packagedBundle && !packageLoading && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Records Packaged</Badge>
                          <span className="text-xs text-muted-foreground">{packagedBundle.bundle_id}</span>
                        </div>
                        <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={downloadBundle}>
                          <Download className="w-3.5 h-3.5" />Download JSON
                        </Button>
                      </div>

                      {packagedBundle.patient_demographics && (
                        <Card>
                          <CardHeader className="pb-1 pt-3">
                            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Patient Demographics</CardTitle>
                          </CardHeader>
                          <CardContent className="pb-3 grid grid-cols-2 gap-1.5 text-xs">
                            <div><span className="text-muted-foreground">Name:</span> {packagedBundle.patient_demographics.first_name} {packagedBundle.patient_demographics.last_name}</div>
                            <div><span className="text-muted-foreground">DOB:</span> {packagedBundle.patient_demographics.date_of_birth}</div>
                            <div><span className="text-muted-foreground">Member ID:</span> {packagedBundle.patient_demographics.member_id}</div>
                            <div><span className="text-muted-foreground">Payer:</span> {packagedBundle.payer_id}</div>
                          </CardContent>
                        </Card>
                      )}

                      <Card>
                        <CardHeader className="pb-1 pt-3">
                          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Submission Checklist</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-3 space-y-1.5">
                          {packagedBundle.submission_checklist.map((item, i) => (
                            <div key={i} className={`flex items-start gap-2 p-2 rounded-md text-xs ${item.status === "complete" ? "bg-emerald-50 border border-emerald-100" : item.status === "pending" ? "bg-blue-50 border border-blue-100" : "bg-red-50 border border-red-100"}`}>
                              {item.status === "complete" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" /> : item.status === "pending" ? <Clock className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />}
                              <div>
                                <p className="font-medium text-foreground">{item.item}</p>
                                {item.note && <p className="text-muted-foreground text-[10px] mt-0.5">{item.note}</p>}
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-1 pt-3">
                          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Chart Artifacts ({packagedBundle.total_artifacts})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pb-3 space-y-2">
                          {packagedBundle.artifacts.map((a) => (
                            <div key={a.artifact_id} className="p-2.5 rounded-md bg-muted/50 border border-border">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-xs font-medium text-foreground">{a.title}</p>
                                  <p className="text-[10px] text-muted-foreground">{a.date} · {a.provider}</p>
                                </div>
                                <Badge className="text-[10px] bg-muted text-muted-foreground border-border shrink-0">
                                  {a.artifact_type.replace(/_/g, " ")}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      {packagedBundle.notes && (
                        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
                          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-800">{packagedBundle.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {!packageLoading && !packagedBundle && (
                    <div className="flex flex-col items-center justify-center min-h-[300px] text-center gap-2">
                      <Package className="w-8 h-8 text-muted-foreground/30" />
                      <p className="text-sm font-medium text-muted-foreground">Packaged Records</p>
                      <p className="text-xs text-muted-foreground max-w-xs">Approve the draft letter to package clinical records for payer submission.</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
