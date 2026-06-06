/**
 * Structured order view + integration mapping for the View Order panel.
 * Demo metadata aligns with backend seeded patients / FHIR ServiceRequests.
 */

import type { OrderRequest, PatientDemographics } from "@/types";
import {
  DEMO_FILING_CASES,
  getDemoFilingDeadline,
  serviceDateDaysAgo,
} from "@/lib/filing-deadlines";

export interface DemoIntegrationMeta {
  order_id: string;
  source_system: string;
  referring_provider?: string;
  member_id: string;
}

/** Per-template integration + routing metadata (configuration, not one-off UI state). */
export const DEMO_INTEGRATION_META: Record<string, DemoIntegrationMeta> = {
  "DEMO-001": {
    order_id: "ORD-2024-10482736-001",
    source_system: "Epic Ambulatory · FHIR R4 ServiceRequest",
    referring_provider: "Dr. Patricia Hayes, MD (Internal Medicine)",
    member_id: "BCBS-PPO-7734521",
  },
  "DEMO-002": {
    order_id: "ORD-2024-20193847-001",
    source_system: "Cerner PowerChart · FHIR R4 ServiceRequest",
    referring_provider: "Dr. Michael Torres, MD, FACC (Cardiology)",
    member_id: "UHC-HMO-4482019",
  },
  "DEMO-003": {
    order_id: "ORD-2024-30571629-001",
    source_system: "Epic Ambulatory · HL7 ORM^O01 → FHIR adapter",
    referring_provider: "Dr. Angela Reyes, MD (Hospital Medicine)",
    member_id: "AETNA-PPO-9901344",
  },
};

const MEMBER_BY_PATIENT: Record<string, string> = {
  "10482736": "BCBS-PPO-7734521",
  "20193847": "UHC-HMO-4482019",
  "30571629": "AETNA-PPO-9901344",
};

const PLAN_LABELS: Record<string, string> = {
  commercial: "Commercial PPO",
  commercial_hmo: "Commercial HMO",
  medicare: "Medicare",
  medicaid: "Medicaid",
};

const PAYER_LABELS: Record<string, string> = {
  bcbs_tx: "BCBS Texas PPO",
  unitedhealthcare: "United Healthcare HMO",
  aetna: "Aetna PPO",
};

export interface OrderViewContext {
  order_id: string;
  patient_id: string;
  patient_name: string;
  payer_display: string;
  payer_id: string;
  plan_type: string;
  plan_label: string;
  member_id: string;
  cpt_code: string;
  icd10_codes: string[];
  procedure_description: string;
  ordering_provider: string;
  ordering_provider_npi?: string;
  facility_npi?: string;
  service_date: string;
  referring_provider?: string;
  source_system: string;
  template_id?: string;
}

export interface CoverageRoutingContext {
  payer_display: string;
  canonical_payer_key: string;
  plan_type: string;
  member_id: string;
  cpt_code: string;
  route_key: string;
}

function resolveServiceDate(templateId?: string, payerId?: string): string {
  if (templateId) {
    const filing = getDemoFilingDeadline(templateId);
    if (filing) return filing.serviceDate;
    const cfg = DEMO_FILING_CASES.find((c) => c.caseId === templateId);
    if (cfg) return serviceDateDaysAgo(cfg.serviceDaysAgo);
  }
  return serviceDateDaysAgo(0);
}

function resolveOrderId(
  templateId: string | undefined,
  patientId: string,
  serviceDate: string,
): string {
  if (templateId && DEMO_INTEGRATION_META[templateId]) {
    return DEMO_INTEGRATION_META[templateId].order_id;
  }
  const compact = serviceDate.replace(/-/g, "");
  return patientId ? `ORD-${patientId}-${compact}` : "—";
}

export function buildOrderViewContext(params: {
  form: Partial<OrderRequest>;
  patientName?: string;
  payerDisplay?: string;
  templateId?: string;
  workflowPatient?: PatientDemographics | null;
}): OrderViewContext | null {
  const { form, patientName, payerDisplay, templateId, workflowPatient } = params;
  if (!form.patient_id?.trim()) return null;

  const patient_id = form.patient_id.trim();
  const payer_id = form.payer_id ?? "";
  const plan_type = form.plan_type ?? "";
  const integration = templateId ? DEMO_INTEGRATION_META[templateId] : undefined;
  const service_date = resolveServiceDate(templateId, payer_id);

  const member_id =
    workflowPatient?.member_id ??
    integration?.member_id ??
    MEMBER_BY_PATIENT[patient_id] ??
    "—";

  const name =
    patientName ??
    (workflowPatient
      ? `${workflowPatient.first_name} ${workflowPatient.last_name}`
      : patient_id);

  const payer_display =
    payerDisplay ??
    PAYER_LABELS[payer_id] ??
    (payer_id || "—");

  return {
    order_id: resolveOrderId(templateId, patient_id, service_date),
    patient_id,
    patient_name: name,
    payer_display,
    payer_id: payer_id || "—",
    plan_type: plan_type || "—",
    plan_label: PLAN_LABELS[plan_type] ?? (plan_type || "—"),
    member_id,
    cpt_code: form.cpt_code ?? "—",
    icd10_codes: form.icd10_codes?.length ? form.icd10_codes : [],
    procedure_description: form.procedure_description ?? "—",
    ordering_provider: form.ordering_provider_name ?? "—",
    ordering_provider_npi: form.ordering_provider_npi,
    facility_npi: form.facility_npi,
    service_date,
    referring_provider: integration?.referring_provider,
    source_system: integration?.source_system ?? "Manual entry · ClaimShield web form",
    template_id: templateId,
  };
}

export function buildCoverageRouting(ctx: OrderViewContext): CoverageRoutingContext {
  const canonical = ctx.payer_id !== "—" ? ctx.payer_id : "unknown";
  const plan = ctx.plan_type !== "—" ? ctx.plan_type : "unknown";
  const cpt = ctx.cpt_code !== "—" ? ctx.cpt_code : "*";
  return {
    payer_display: ctx.payer_display,
    canonical_payer_key: canonical,
    plan_type: plan,
    member_id: ctx.member_id,
    cpt_code: cpt,
    route_key: `${canonical} + ${plan} + ${cpt}`,
  };
}

/** Simulated inbound adapter payload (source EHR / interface engine). */
export function buildInboundPayload(ctx: OrderViewContext): Record<string, unknown> {
  return {
    resourceType: "ServiceRequest",
    id: ctx.order_id,
    status: "active",
    intent: "order",
    authoredOn: ctx.service_date,
    subject: { reference: `Patient/${ctx.patient_id}`, display: ctx.patient_name },
    requester: {
      reference: ctx.ordering_provider_npi
        ? `Practitioner/${ctx.ordering_provider_npi}`
        : undefined,
      display: ctx.ordering_provider,
    },
    code: {
      coding: [{ system: "http://www.ama-assn.org/go/cpt", code: ctx.cpt_code }],
      text: ctx.procedure_description,
    },
    reasonCode: ctx.icd10_codes.map((code) => ({
      coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code }],
    })),
    insurance: [{ reference: `Coverage/${ctx.member_id}` }],
    meta: {
      source: ctx.source_system,
      tag: ctx.template_id ? [{ code: "workflow-template", display: ctx.template_id }] : [],
    },
  };
}

/** Normalized ClaimShield internal order schema. */
export function buildNormalizedOrder(ctx: OrderViewContext): Record<string, unknown> {
  return {
    schema_version: "claimshield.order.v1",
    order_id: ctx.order_id,
    patient_id: ctx.patient_id,
    payer_id: ctx.payer_id,
    plan_type: ctx.plan_type,
    cpt_code: ctx.cpt_code,
    procedure_description: ctx.procedure_description,
    icd10_codes: ctx.icd10_codes,
    ordering_provider_npi: ctx.ordering_provider_npi ?? null,
    ordering_provider_name: ctx.ordering_provider,
    facility_npi: ctx.facility_npi ?? null,
    service_date: ctx.service_date,
    demo_case_id: ctx.template_id ?? null,
    integration_source: ctx.source_system,
  };
}
