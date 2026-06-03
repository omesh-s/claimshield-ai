import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CriterionStatus, StepStatus, SubmissionReadiness } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Status color helpers (semantic palette)
// ---------------------------------------------------------------------------

export function criterionStatusColor(status: CriterionStatus): string {
  return {
    met: "text-emerald-700 bg-emerald-50 border-emerald-200",
    missing: "text-red-700 bg-red-50 border-red-200",
    ambiguous: "text-amber-700 bg-amber-50 border-amber-200",
    conflict: "text-red-800 bg-red-100 border-red-300",
  }[status];
}

export function stepStatusColor(status: StepStatus): string {
  return {
    pending: "text-slate-400",
    running: "text-blue-500",
    complete: "text-emerald-600",
    error: "text-red-600",
    skipped: "text-slate-300",
  }[status];
}

export function readinessColor(readiness: SubmissionReadiness): string {
  return {
    ready: "text-emerald-700 bg-emerald-50",
    needs_review: "text-amber-700 bg-amber-50",
    not_ready: "text-red-700 bg-red-50",
  }[readiness];
}

export function urgencyColor(urgency: string): string {
  return (
    {
      ok: "text-emerald-700 bg-emerald-50",
      warning: "text-amber-700 bg-amber-50",
      critical: "text-orange-700 bg-orange-50",
      overdue: "text-red-700 bg-red-50",
    }[urgency] ?? "text-slate-600 bg-slate-50"
  );
}

// ---------------------------------------------------------------------------
// Misc formatting
// ---------------------------------------------------------------------------

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatScore(score: number): string {
  return `${Math.round(score)}%`;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "…";
}
