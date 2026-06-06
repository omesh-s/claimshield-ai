"use client";

import { useMemo, useState } from "react";
import { FileJson, Route } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  buildOrderViewContext,
  buildCoverageRouting,
  buildInboundPayload,
  buildNormalizedOrder,
  type OrderViewContext,
} from "@/lib/order-view";
import type { OrderRequest, PatientDemographics } from "@/types";

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-1.5 border-b border-border/50 last:border-0">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xs text-foreground font-mono mt-0.5 break-all">{value || "—"}</p>
    </div>
  );
}

function JsonBlock({ data }: { data: Record<string, unknown> }) {
  return (
    <pre className="text-[10px] font-mono leading-relaxed bg-muted/40 border border-border rounded-md p-3 overflow-x-auto max-h-[280px] overflow-y-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

interface ViewOrderPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: Partial<OrderRequest>;
  patientName?: string;
  payerDisplay?: string;
  templateId?: string;
  workflowPatient?: PatientDemographics | null;
}

export function ViewOrderPanel({
  open,
  onOpenChange,
  form,
  patientName,
  payerDisplay,
  templateId,
  workflowPatient,
}: ViewOrderPanelProps) {
  const [tab, setTab] = useState("details");

  const ctx: OrderViewContext | null = useMemo(
    () =>
      buildOrderViewContext({
        form,
        patientName,
        payerDisplay,
        templateId,
        workflowPatient,
      }),
    [form, patientName, payerDisplay, templateId, workflowPatient],
  );

  const routing = ctx ? buildCoverageRouting(ctx) : null;
  const inbound = ctx ? buildInboundPayload(ctx) : null;
  const normalized = ctx ? buildNormalizedOrder(ctx) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileJson className="w-4 h-4 text-primary" />
            View Order
          </DialogTitle>
          <DialogDescription>
            Structured order record and payer routing context.
          </DialogDescription>
        </DialogHeader>

        {!ctx ? (
          <p className="text-sm text-muted-foreground py-4">
            Enter a patient ID to view the order object.
          </p>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-3">
              <TabsTrigger value="details">Order Details</TabsTrigger>
              <TabsTrigger value="integration">Integration</TabsTrigger>
              <TabsTrigger value="coverage">Coverage Context</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-3">
              {ctx.template_id && (
                <Badge variant="outline" className="text-[10px]">
                  Template {ctx.template_id}
                </Badge>
              )}
              <div className="rounded-md border border-border p-3">
                <MetaRow label="Order ID" value={ctx.order_id} />
                <MetaRow label="Patient" value={`${ctx.patient_name} (${ctx.patient_id})`} />
                <MetaRow label="Payer / Plan" value={`${ctx.payer_display} · ${ctx.plan_label}`} />
                <MetaRow label="Member ID" value={ctx.member_id} />
                <MetaRow label="CPT" value={ctx.cpt_code} />
                <MetaRow
                  label="ICD-10"
                  value={ctx.icd10_codes.length ? ctx.icd10_codes.join(", ") : "—"}
                />
                <MetaRow label="Procedure" value={ctx.procedure_description} />
                <MetaRow label="Ordering Provider" value={ctx.ordering_provider} />
                {ctx.referring_provider && (
                  <MetaRow label="Referring Provider" value={ctx.referring_provider} />
                )}
                <MetaRow label="Service Date" value={ctx.service_date} />
                <MetaRow label="Source" value={ctx.source_system} />
              </div>
            </TabsContent>

            <TabsContent value="integration" className="space-y-3">
              <div>
                <p className="text-xs font-medium text-foreground mb-1.5">Inbound source payload</p>
                {inbound && <JsonBlock data={inbound} />}
              </div>
              <div>
                <p className="text-xs font-medium text-foreground mb-1.5">
                  Normalized ClaimShield order
                </p>
                {normalized && <JsonBlock data={normalized} />}
              </div>
            </TabsContent>

            <TabsContent value="coverage" className="space-y-3">
              {routing && (
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Route className="w-3.5 h-3.5 text-primary" />
                    Insurance mapping
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Payer</p>
                      <p className="font-medium">{routing.payer_display}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Canonical payer key</p>
                      <p className="font-mono">{routing.canonical_payer_key}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Plan type</p>
                      <p className="font-mono">{routing.plan_type}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Member ID</p>
                      <p className="font-mono">{routing.member_id}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">CPT</p>
                      <p className="font-mono">{routing.cpt_code}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] text-muted-foreground">Prior-auth rules route</p>
                      <p className="font-mono text-primary mt-0.5">{routing.route_key}</p>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
