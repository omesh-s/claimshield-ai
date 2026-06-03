import Link from "next/link";
import {
  ShieldCheck,
  FileText,
  Clock,
  Users,
  CheckCircle2,
  ChevronRight,
  Zap,
  Database,
  Brain,
  PenLine,
  Star,
  TrendingUp,
  DollarSign,
  Target,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATS = [
  {
    value: "Up to 43 Min",
    label: "Avg Staff Time Saved Per Prior Auth Case",
    icon: Clock,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-100",
  },
  {
    value: "100%",
    label: "Criteria Pre-Checked Before Every Submission",
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
  },
  {
    value: "~75%",
    label: "Preventable Denials — Most Are Avoidable",
    icon: ShieldCheck,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-100",
  },
  {
    value: "Always",
    label: "Human Review — Every Draft Reviewed by Staff",
    icon: Users,
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-100",
  },
];

const WORKFLOW_STEPS = [
  {
    num: "01",
    icon: Zap,
    label: "Detect",
    desc: "Check if PA is required via clearinghouse API and validate CPT/ICD-10 pairing",
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    num: "02",
    icon: Database,
    label: "Retrieve",
    desc: "Pull matching payer policy chunks from pgvector using semantic search",
    color: "text-indigo-600",
    bg: "bg-indigo-50",
  },
  {
    num: "03",
    icon: Brain,
    label: "Analyze",
    desc: "Gemini evaluates each payer criterion against the patient chart",
    color: "text-violet-600",
    bg: "bg-violet-50",
  },
  {
    num: "04",
    icon: PenLine,
    label: "Draft",
    desc: "AI drafts a clinical justification letter citing chart evidence",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    num: "05",
    icon: Star,
    label: "Score",
    desc: "AI self-scores the draft against payer criteria before staff review",
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
];

const QUICK_ACTIONS = [
  {
    href: "/order",
    icon: FileText,
    label: "New PA Request",
    description: "Run the full AI prior auth workflow for a new clinical order.",
    badge: "Primary",
  },
  {
    href: "/order",
    icon: ShieldCheck,
    label: "Load Demo Case",
    description: "Pre-fill with DEMO-001 (missing cardiology note scenario).",
    badge: "Demo",
  },
];

export default function DashboardPage() {
  return (
    <div className="px-52 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">ClaimShield AI</h1>
            <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 px-1.5">
              Beta
            </Badge>
          </div>
          <p className="text-muted-foreground text-base max-w-lg">
            AI-powered prior authorization automation. Reduce avoidable denials, save staff time,
            and ground every decision in real payer policy documents.
          </p>
        </div>
        <Link
          href="/order"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          <FileText className="w-4 h-4" />
          New PA Request
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATS.map(({ label, value, icon: Icon, color, bg, border }) => (
          <Card key={label} className={`border ${border}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
              </div>
              <p className="text-3xl font-bold text-foreground leading-tight">{value}</p>
              <p className="text-sm font-medium text-muted-foreground mt-1 leading-snug">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Workflow explainer */}
      <Card className="border-border">
        <CardHeader className="pb-3 pt-5">
          <CardTitle className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            How the AI Workflow Works
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            5 Automated Steps — Every Output Is a Draft for Staff Review Before Payer Submission.
          </p>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="grid grid-cols-5 gap-2 relative">
            {/* Connector line */}
            <div className="absolute top-5 left-[10%] right-[10%] h-px bg-border hidden md:block" />

            {WORKFLOW_STEPS.map(({ num, icon: Icon, label, desc, color, bg }) => (
              <div key={num} className="flex flex-col items-center text-center gap-2 relative">
                <div
                  className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center ring-2 ring-background z-10`}
                >
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">{label}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed hidden lg:block">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Step descriptions for smaller screens */}
          <div className="mt-4 space-y-1.5 lg:hidden">
            {WORKFLOW_STEPS.map(({ num, label, desc }) => (
              <div key={num} className="flex gap-2 text-sm">
                <span className="text-muted-foreground font-mono w-5 shrink-0">{num}</span>
                <span>
                  <span className="font-semibold text-foreground">{label}</span>
                  {" — "}
                  <span className="text-muted-foreground">{desc}</span>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {QUICK_ACTIONS.map(({ href, icon: Icon, label, description, badge }) => (
            <Link key={label} href={href}>
              <Card className="hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer h-full">
                <CardContent className="p-6 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-semibold text-foreground">{label}</p>
                      <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">
                        {badge}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Business Case Panel ── */}
      <Card className="border-blue-100 bg-linear-to-br from-blue-50 to-indigo-50/30">
        <CardHeader className="pb-3 pt-5">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            Business Case
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Why prior authorization automation matters — and why it pays for itself in 90 days.
          </p>
        </CardHeader>
        <CardContent className="pb-5 space-y-4">
          {/* Problem / Solution */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-red-50 border border-red-100">
              <p className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />Problem
              </p>
              <p className="text-xs text-red-800 leading-relaxed">
                Prior auth delays average <strong>14 days</strong>. 1 in 5 requests are denied on first submission — most because of missing documentation that AI can catch in seconds.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <p className="text-xs font-semibold text-emerald-700 mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />Solution
              </p>
              <p className="text-xs text-emerald-800 leading-relaxed">
                ClaimShield AI reduces auth cycle to <strong>&lt;2 hours</strong> using AI-powered gap analysis, semantically retrieved payer policy, and auto-drafted appeal letters — all with staff sign-off.
              </p>
            </div>
          </div>

          {/* Market + ROI */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-white border border-blue-100 text-center">
              <DollarSign className="w-4 h-4 text-blue-600 mx-auto mb-1" />
              <p className="text-sm font-bold text-blue-700">$15B+</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Revenue Cycle Mgmt TAM</p>
            </div>
            <div className="p-3 rounded-lg bg-white border border-indigo-100 text-center">
              <TrendingUp className="w-4 h-4 text-indigo-600 mx-auto mb-1" />
              <p className="text-sm font-bold text-indigo-700">$3.2B</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Patient Access Automation SAM</p>
            </div>
            <div className="p-3 rounded-lg bg-white border border-emerald-100 text-center">
              <DollarSign className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
              <p className="text-sm font-bold text-emerald-700">$51K/yr</p>
              <p className="text-[10px] text-muted-foreground leading-tight">ROI per provider (4 hrs/day × $35)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── AI Components Panel ── */}
      <Card className="border-violet-100">
        <CardHeader className="pb-2 pt-5">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-600" />
            AI Components
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Production-grade AI stack — each component chosen for reliability and clinical accuracy.
          </p>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { label: "Multi-Pipeline RAG", desc: "pgvector semantic search + tsvector keyword fallback. Payer isolation enforced at SQL level — no cross-payer chunk leakage.", badge: "Retrieval" },
              { label: "LangGraph Orchestration", desc: "5-node directed graph: Detect → Retrieve → Analyze → Draft → Score. SSE-streamed to frontend in real time.", badge: "Workflow" },
              { label: "Gemini Flash", desc: "Gap analysis (JSON mode), justification letter drafting (plain text), self-score reviewer (JSON mode). 30s timeout, 1 retry.", badge: "LLM" },
              { label: "Redis Semantic Cache", desc: "24h TTL cache on policy chunks (key: payer+CPT). Cache hit/miss surfaced in UI. Reduces Gemini embedding calls.", badge: "Cache" },
              { label: "FHIR R4 Mock EHR", desc: "Patient chart artifacts (ServiceRequest, clinical notes) in HL7 FHIR R4 format. Realistic demo without real PHI.", badge: "Interop" },
              { label: "X12 270/271 Clearinghouse", desc: "Mock eligibility verification response in X12 transaction format. PA criteria extracted from structured 271 fields.", badge: "Interop" },
            ].map(({ label, desc, badge }) => (
              <div key={label} className="flex items-start gap-2 p-2.5 rounded-md bg-violet-50/50 border border-violet-100">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-xs font-semibold text-foreground">{label}</p>
                    <Badge className="text-[9px] px-1.5 py-0 bg-violet-100 text-violet-700 border-violet-200">{badge}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* HITL disclaimer */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
        <div>
          <span className="font-semibold">Human-in-the-Loop:</span> ClaimShield AI never
          auto-submits to a payer. Every AI output — gap analysis, draft letter, and score — is a
          draft that requires staff review and approval before any payer interaction.
        </div>
      </div>
    </div>
  );
}
