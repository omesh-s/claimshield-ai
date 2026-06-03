"""
Central Pydantic schemas for all request/response contracts.
Organized by domain area.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared enums
# ---------------------------------------------------------------------------

class WorkflowStep(str, Enum):
    DETECT = "detect"
    RETRIEVE = "retrieve"
    ANALYZE = "analyze"
    DRAFT = "draft"
    SCORE = "score"
    APPEAL = "appeal"
    PACKAGE = "package_records"


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    ERROR = "error"
    SKIPPED = "skipped"


class CriterionStatus(str, Enum):
    MET = "met"
    MISSING = "missing"
    AMBIGUOUS = "ambiguous"
    CONFLICT = "conflict"


class SubmissionReadiness(str, Enum):
    READY = "ready"
    NEEDS_REVIEW = "needs_review"
    NOT_READY = "not_ready"


# ---------------------------------------------------------------------------
# Patient / Order
# ---------------------------------------------------------------------------

class PatientDemographics(BaseModel):
    patient_id: str
    first_name: str
    last_name: str
    date_of_birth: str  # ISO date string
    gender: str
    member_id: str
    group_number: str | None = None


class OrderRequest(BaseModel):
    patient_id: str = Field(..., description="Internal patient ID")
    payer_id: str = Field(..., description="Payer identifier e.g. 'bcbs_tx'")
    plan_type: str = Field(..., description="Plan type e.g. 'commercial', 'medicare_advantage'")
    cpt_code: str = Field(..., description="Primary CPT code for the procedure")
    procedure_description: str
    icd10_codes: list[str] = Field(..., min_length=1, description="Diagnosis codes supporting the procedure")
    ordering_provider_npi: str
    ordering_provider_name: str
    facility_npi: str | None = None
    clinical_notes: str | None = Field(None, description="Free-text provider notes for analysis")
    demo_case_id: str | None = Field(None, description="Pre-seeded demo scenario ID")


# ---------------------------------------------------------------------------
# Prior Auth Requirement Check
# ---------------------------------------------------------------------------

class PARequirementResult(BaseModel):
    required: bool
    reason: str
    source: str  # "clearinghouse_api" | "local_rules" | "fallback"
    confidence: float = Field(..., ge=0.0, le=1.0)
    recommendation: str
    is_fallback: bool = False
    raw_response: dict[str, Any] | None = None
    checked_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Policy Retrieval
# ---------------------------------------------------------------------------

class PolicyChunk(BaseModel):
    chunk_id: str
    payer_id: str
    plan_type: str
    source_doc: str
    page_num: int | None
    content: str
    similarity_score: float
    cpt_codes: list[str] = []
    icd10_codes: list[str] = []
    source: str = "vector_search"  # "vector_search" | "keyword_fallback"


class PolicyRetrievalResult(BaseModel):
    payer_id: str
    plan_type: str
    cpt_code: str
    chunks: list[PolicyChunk]
    total_retrieved: int
    retrieval_strategy: str  # "vector_search" | "keyword_fallback"
    cache_hit: bool = False


# ---------------------------------------------------------------------------
# Clinical Gap Analysis
# ---------------------------------------------------------------------------

class CriterionEvaluation(BaseModel):
    criterion_id: str
    criterion_text: str
    status: CriterionStatus
    evidence_from_notes: str | None = None
    supporting_chunk_ids: list[str] = []
    recommendation: str | None = None


class CodeAuditWarning(BaseModel):
    warning_id: str
    severity: str  # "high" | "medium" | "low"
    code_type: str  # "cpt" | "icd10"
    code: str
    issue: str
    details: str
    requires_confirmation: bool = True


class CodeMismatchWarning(BaseModel):
    """
    Raised when the CPT code does not align with the documented ICD-10 diagnosis
    codes based on payer policy or standard coding guidelines.
    Triggers the warning modal in the frontend requiring explicit staff confirmation.
    """
    detected: bool
    cpt_code: str
    icd10_codes: list[str]
    warning_message: str = (
        "The procedure code does not align with the documented diagnosis codes. "
        "Please confirm before proceeding."
    )


class GapAnalysisResult(BaseModel):
    criteria_evaluated: list[CriterionEvaluation]
    met_count: int
    missing_count: int
    ambiguous_count: int
    conflict_count: int
    code_audit_warnings: list[CodeAuditWarning] = []
    code_mismatch_warning: CodeMismatchWarning | None = None
    overall_risk: str  # "low" | "medium" | "high"
    analyst_summary: str


# ---------------------------------------------------------------------------
# Draft Generation
# ---------------------------------------------------------------------------

class JustificationLetter(BaseModel):
    draft_id: str
    version: int = 1
    content: str
    cited_policy_chunk_ids: list[str] = []
    word_count: int
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class GapReport(BaseModel):
    report_id: str
    checklist_items: list[CriterionEvaluation]
    action_items: list[str]
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class DraftResult(BaseModel):
    justification_letter: JustificationLetter
    gap_report: GapReport


# ---------------------------------------------------------------------------
# Self-Scoring
# ---------------------------------------------------------------------------

class CriterionScore(BaseModel):
    criterion_id: str
    criterion_text: str
    score: str  # "pass" | "flag" | "fail"
    rationale: str


class ScoringResult(BaseModel):
    scores: list[CriterionScore]
    pass_count: int
    flag_count: int
    fail_count: int
    readiness_score: float = Field(..., ge=0.0, le=100.0)
    submission_readiness: SubmissionReadiness
    reviewer_notes: str
    scored_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Denial & Appeal
# ---------------------------------------------------------------------------

class DenialEvent(BaseModel):
    denial_id: str
    original_order_id: str
    denial_date: str
    denial_reason_code: str
    denial_reason_text: str
    denial_category: str  # "medical_necessity" | "missing_documentation" | "coding_error" | "not_covered"
    payer_reference_number: str | None = None
    appeal_deadline: str | None = None


class AppealLetter(BaseModel):
    appeal_id: str
    denial_id: str
    content: str
    cited_policy_chunk_ids: list[str] = []
    word_count: int
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Record Packaging
# ---------------------------------------------------------------------------

class ChartArtifact(BaseModel):
    artifact_id: str
    artifact_type: str  # "progress_note" | "imaging_report" | "lab_result" | "prior_treatment" | "operative_note"
    title: str
    date: str
    provider: str
    content: str
    relevance_score: float = 1.0


class RecordBundle(BaseModel):
    bundle_id: str
    patient_id: str
    order_id: str
    artifacts: list[ChartArtifact]
    total_artifacts: int
    payer_id: str
    assembled_at: datetime = Field(default_factory=datetime.utcnow)
    notes: str | None = None


# ---------------------------------------------------------------------------
# Patient Impact
# ---------------------------------------------------------------------------

class PatientImpact(BaseModel):
    """
    Patient-facing impact metrics surfaced in the UI to support pitch narrative:
    faster authorization = faster access to care.
    Populated by the scoring/analysis step.
    """
    estimated_wait_time_saved: str = Field(
        ...,
        description="Human-readable estimate, e.g. 'up to 6 days'",
        examples=["up to 6 days"],
    )
    auth_failure_risk: str = Field(
        ...,
        description="Qualitative risk reduction statement",
        examples=["Reduced: all criteria pre-checked before submission"],
    )
    patient_note: str = Field(
        ...,
        description="Plain-language patient benefit statement shown in the UI",
        examples=["Faster authorization means faster access to care for this patient"],
    )


# ---------------------------------------------------------------------------
# Filing Deadline
# ---------------------------------------------------------------------------

class FilingDeadlineRule(BaseModel):
    rule_id: str
    state: str
    payer_id: str | None
    plan_type: str | None
    deadline_days: int
    description: str
    source: str


class FilingDeadlineStatus(BaseModel):
    rule: FilingDeadlineRule
    service_date: str
    deadline_date: str
    days_remaining: int
    is_overdue: bool
    urgency: str  # "ok" | "warning" | "critical" | "overdue"


# ---------------------------------------------------------------------------
# Workflow State (LangGraph)
# ---------------------------------------------------------------------------

class WorkflowState(BaseModel):
    run_id: str
    order: OrderRequest
    patient: PatientDemographics | None = None

    # Step outputs — populated as workflow progresses
    pa_requirement: PARequirementResult | None = None
    policy_retrieval: PolicyRetrievalResult | None = None
    gap_analysis: GapAnalysisResult | None = None
    draft: DraftResult | None = None
    scoring: ScoringResult | None = None
    denial: DenialEvent | None = None
    appeal: AppealLetter | None = None
    record_bundle: RecordBundle | None = None
    patient_impact: PatientImpact | None = None

    # Step tracking
    step_statuses: dict[str, StepStatus] = Field(default_factory=dict)
    current_step: WorkflowStep | None = None
    errors: dict[str, str] = Field(default_factory=dict)
    completed: bool = False
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None


# ---------------------------------------------------------------------------
# API request/response wrappers
# ---------------------------------------------------------------------------

class ProcessOrderRequest(BaseModel):
    order: OrderRequest
    run_through_step: WorkflowStep | None = Field(
        None,
        description="If set, workflow stops after this step. Runs all steps if None.",
    )


class ProcessOrderResponse(BaseModel):
    run_id: str
    status: str
    current_step: str | None
    state: WorkflowState
    processing_time_ms: int


class DemoCaseOption(BaseModel):
    case_id: str
    label: str
    description: str
    scenario_tags: list[str]


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None
    request_id: str | None = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
