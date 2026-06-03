/**
 * TypeScript types mirroring the FastAPI Pydantic schemas.
 * Keep in sync with backend/app/models/schemas.py
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type WorkflowStep =
  | "detect"
  | "retrieve"
  | "analyze"
  | "draft"
  | "score"
  | "appeal"
  | "package_records";

export type StepStatus = "pending" | "running" | "complete" | "error" | "skipped";

export type CriterionStatus = "met" | "missing" | "ambiguous" | "conflict";

export type SubmissionReadiness = "ready" | "needs_review" | "not_ready";

// ---------------------------------------------------------------------------
// Patient / Order
// ---------------------------------------------------------------------------

export interface PatientDemographics {
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  member_id: string;
  group_number?: string;
}

export interface OrderRequest {
  patient_id: string;
  payer_id: string;
  plan_type: string;
  cpt_code: string;
  procedure_description: string;
  icd10_codes: string[];
  ordering_provider_npi: string;
  ordering_provider_name: string;
  facility_npi?: string;
  clinical_notes?: string;
  demo_case_id?: string;
}

// ---------------------------------------------------------------------------
// Prior Auth Requirement
// ---------------------------------------------------------------------------

export interface PARequirementResult {
  required: boolean;
  reason: string;
  source: string;
  confidence: number;
  recommendation: string;
  is_fallback: boolean;
  checked_at: string;
}

// ---------------------------------------------------------------------------
// Policy Retrieval
// ---------------------------------------------------------------------------

export interface PolicyChunk {
  chunk_id: string;
  payer_id: string;
  plan_type: string;
  source_doc: string;
  page_num?: number;
  content: string;
  similarity_score: number;
  cpt_codes: string[];
  icd10_codes: string[];
  source: "vector_search" | "keyword_fallback";
}

export interface PolicyRetrievalResult {
  payer_id: string;
  plan_type: string;
  cpt_code: string;
  chunks: PolicyChunk[];
  total_retrieved: number;
  retrieval_strategy: string;
  cache_hit: boolean;
}

// ---------------------------------------------------------------------------
// Gap Analysis
// ---------------------------------------------------------------------------

export interface CriterionEvaluation {
  criterion_id: string;
  criterion_text: string;
  status: CriterionStatus;
  evidence_from_notes?: string;
  supporting_chunk_ids: string[];
  recommendation?: string;
}

export interface CodeAuditWarning {
  warning_id: string;
  severity: "high" | "medium" | "low";
  code_type: "cpt" | "icd10";
  code: string;
  issue: string;
  details: string;
  requires_confirmation: boolean;
}

export interface CodeMismatchWarning {
  detected: boolean;
  cpt_code: string;
  icd10_codes: string[];
  warning_message: string;
}

export interface GapAnalysisResult {
  criteria_evaluated: CriterionEvaluation[];
  met_count: number;
  missing_count: number;
  ambiguous_count: number;
  conflict_count: number;
  code_audit_warnings: CodeAuditWarning[];
  code_mismatch_warning?: CodeMismatchWarning;
  overall_risk: "low" | "medium" | "high";
  analyst_summary: string;
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export interface JustificationLetter {
  draft_id: string;
  version: number;
  content: string;
  cited_policy_chunk_ids: string[];
  word_count: number;
  generated_at: string;
}

export interface GapReport {
  report_id: string;
  checklist_items: CriterionEvaluation[];
  action_items: string[];
  generated_at: string;
}

export interface DraftResult {
  justification_letter: JustificationLetter;
  gap_report: GapReport;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface CriterionScore {
  criterion_id: string;
  criterion_text: string;
  score: "pass" | "flag" | "fail";
  rationale: string;
}

export interface ScoringResult {
  scores: CriterionScore[];
  pass_count: number;
  flag_count: number;
  fail_count: number;
  readiness_score: number;
  submission_readiness: SubmissionReadiness;
  reviewer_notes: string;
  scored_at: string;
}

// ---------------------------------------------------------------------------
// Denial & Appeal
// ---------------------------------------------------------------------------

export interface DenialEvent {
  denial_id: string;
  original_order_id: string;
  denial_date: string;
  denial_reason_code: string;
  denial_reason_text: string;
  denial_category: "medical_necessity" | "missing_documentation" | "coding_error" | "not_covered";
  payer_reference_number?: string;
  appeal_deadline?: string;
}

export interface AppealLetter {
  appeal_id: string;
  denial_id: string;
  content: string;
  cited_policy_chunk_ids: string[];
  word_count: number;
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface ChartArtifact {
  artifact_id: string;
  artifact_type: "progress_note" | "imaging_report" | "lab_result" | "prior_treatment" | "operative_note";
  title: string;
  date: string;
  provider: string;
  content: string;
  relevance_score: number;
}

export interface RecordBundle {
  bundle_id: string;
  patient_id: string;
  order_id: string;
  artifacts: ChartArtifact[];
  total_artifacts: number;
  payer_id: string;
  assembled_at: string;
  notes?: string;
}

export interface SubmissionChecklistItem {
  item: string;
  status: "complete" | "pending" | "action_required";
  note?: string;
}

export interface PackagedBundle {
  bundle_id: string;
  patient_id: string;
  order_id: string;
  payer_id: string;
  bundle_type?: string;
  denial_id?: string;
  assembled_at: string;
  patient_demographics?: PatientDemographics;
  artifacts: ChartArtifact[];
  total_artifacts: number;
  submission_checklist: SubmissionChecklistItem[];
  notes?: string;
}

// ---------------------------------------------------------------------------
// Patient Impact
// ---------------------------------------------------------------------------

export interface PatientImpact {
  estimated_wait_time_saved: string;
  auth_failure_risk: string;
  patient_note: string;
}

// ---------------------------------------------------------------------------
// Filing Deadline
// ---------------------------------------------------------------------------

export interface FilingDeadlineRule {
  rule_id: string;
  state: string;
  payer_id?: string;
  plan_type?: string;
  deadline_days: number;
  description: string;
  source: string;
}

export interface FilingDeadlineStatus {
  rule: FilingDeadlineRule;
  service_date: string;
  deadline_date: string;
  days_remaining: number;
  is_overdue: boolean;
  urgency: "ok" | "warning" | "critical" | "overdue";
}

// ---------------------------------------------------------------------------
// Workflow State
// ---------------------------------------------------------------------------

export interface WorkflowState {
  run_id: string;
  order: OrderRequest;
  patient?: PatientDemographics;
  pa_requirement?: PARequirementResult;
  policy_retrieval?: PolicyRetrievalResult;
  gap_analysis?: GapAnalysisResult;
  draft?: DraftResult;
  scoring?: ScoringResult;
  denial?: DenialEvent;
  appeal?: AppealLetter;
  record_bundle?: RecordBundle;
  patient_impact?: PatientImpact;
  step_statuses: Record<string, StepStatus>;
  current_step?: WorkflowStep;
  errors: Record<string, string>;
  completed: boolean;
  started_at: string;
  completed_at?: string;
}

// ---------------------------------------------------------------------------
// API shapes
// ---------------------------------------------------------------------------

export interface ProcessOrderResponse {
  run_id: string;
  status: string;
  current_step?: string;
  state: WorkflowState;
  processing_time_ms: number;
}

export interface DemoCaseOption {
  case_id: string;
  label: string;
  description: string;
  scenario_tags: string[];
}

/** Full demo case from GET /demo-cases/{case_id} — canonical order from backend. */
export interface DemoCaseDetail {
  case_id: string;
  label: string;
  description: string;
  scenario_tags: string[];
  order: OrderRequest;
  patient_name: string;
  payer_display: string;
  denial_id?: string | null;
}

export interface HealthResponse {
  status: string;
  version: string;
  environment: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// SSE event types (from POST /api/v1/process-order stream)
// ---------------------------------------------------------------------------

export interface SSEStepData {
  pa_required?: boolean;
  criteria_count?: number;
  code_mismatch?: boolean;
  is_fallback?: boolean;
  chunks_retrieved?: number;
  strategy?: string;
  cache_hit?: boolean;
  met?: number;
  missing?: number;
  unclear?: number;
  overall_risk?: string;
  word_count?: number;
  action_items?: number;
  readiness_score?: number;
  pass?: number;
  flag?: number;
  fail?: number;
  recommendation?: string;
  error?: string;
  message?: string;
}

export interface SSEEvent {
  event: "started" | "step_update" | "complete" | "error" | "heartbeat" | "pa_not_required";
  run_id?: string;
  current_state?: string;
  status?: "running" | "complete" | "error" | "pa_not_required";
  data?: SSEStepData;
  result?: WorkflowResult;
  elapsed_ms?: number;
  message?: string;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// WorkflowResult — the "result" field in the SSE "complete" event
// ---------------------------------------------------------------------------

export interface WorkflowResult {
  run_id: string;
  completed: boolean;
  step_statuses: Record<string, string>;
  errors: Record<string, string>;
  pa_requirement?: PARequirementResult;
  pa_criteria?: string[];
  pa_not_required?: boolean;
  policy_retrieval?: PolicyRetrievalResult;
  gap_analysis?: GapAnalysisResult;
  code_mismatch_warning?: CodeMismatchWarning;
  draft?: DraftResult;
  patient_impact?: PatientImpact;
  scoring?: ScoringResult;
  patient?: PatientDemographics;
}

// ---------------------------------------------------------------------------
// Pitch context (judge-facing business cards)
// ---------------------------------------------------------------------------

export interface PitchContext {
  tam: string;
  sam: string;
  lead_customer: string;
  pricing_model: string;
  ip_moat: string;
  ideal_first_customer_size: string;
}

// ---------------------------------------------------------------------------
// FHIR R4 ServiceRequest (mirrors ehr.py mock structure)
// ---------------------------------------------------------------------------

export interface FHIRCoding {
  system: string;
  code: string;
  display: string;
}

export interface FHIRCodeableConcept {
  coding: FHIRCoding[];
  text?: string;
}

export interface FHIRReference {
  reference: string;
  display?: string;
}

export interface FHIRAnnotation {
  text: string;
  time?: string;
}

export interface FHIRServiceRequest {
  resourceType: "ServiceRequest";
  id: string;
  status: string;
  intent: string;
  subject: FHIRReference;
  requester: FHIRReference;
  code: FHIRCodeableConcept;
  reasonCode: FHIRCodeableConcept[];
  note: FHIRAnnotation[];
  authoredOn?: string;
  insurance: FHIRReference[];
}

// ---------------------------------------------------------------------------
// X12 270/271 clearinghouse (mirrors clearinghouse.py mock structure)
// ---------------------------------------------------------------------------

export interface X12AuthCriterion {
  criterionId: string;
  description: string;
  required: boolean;
}

export interface X12EligibilityResponse {
  transactionId: string;
  memberId: string;
  payerId: string;
  planType: string;
  procedureCode: string;
  authRequired: boolean;
  authRequiredReason: string;
  criteria: X12AuthCriterion[];
  confidence: number;
  responseDate: string;
  source: string;
  rawSegments?: Record<string, string>;
}
