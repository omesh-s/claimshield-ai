/**
 * API client — all calls go through the Next.js /api/backend proxy.
 * The proxy forwards to BACKEND_URL (default: http://localhost:8000/api/v1).
 *
 * For SSE streaming, processStream() uses fetch directly against the proxy
 * and returns an AsyncGenerator of SSEEvent objects.
 */

import type {
  OrderRequest,
  WorkflowStep,
  DemoCaseOption,
  DemoCaseDetail,
  DenialEvent,
  AppealLetter,
  RecordBundle,
  PackagedBundle,
  HealthResponse,
  PitchContext,
  SSEEvent,
} from "@/types";

const BASE = "/api/backend";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? body.detail ?? "Request failed", body);
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const healthApi = {
  check: () => request<HealthResponse>("/health"),
};

// ---------------------------------------------------------------------------
// Pitch context
// ---------------------------------------------------------------------------

export const pitchApi = {
  getContext: () => request<PitchContext>("/pitch-context"),
};

// ---------------------------------------------------------------------------
// Demo cases
// ---------------------------------------------------------------------------

export const demoCasesApi = {
  list: () => request<DemoCaseOption[]>("/demo-cases"),

  get: (caseId: string) => request<DemoCaseDetail>(`/demo-cases/${caseId}`),
};

// ---------------------------------------------------------------------------
// Orders / workflow — SSE streaming
// ---------------------------------------------------------------------------

/**
 * Submit an order to the workflow and stream SSE events.
 * The async generator yields one SSEEvent per SSE message from the server.
 *
 * Usage:
 *   for await (const event of ordersApi.processStream(order)) { ... }
 *
 * This goes through the Next.js /api/backend proxy which transparently
 * forwards the streaming response body.
 */
export const ordersApi = {
  async *processStream(
    order: OrderRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<SSEEvent, void, undefined> {
    const response = await fetch(`${BASE}/process-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
      signal,
    });

    if (!response.ok || !response.body) {
      const errBody = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        errBody.error ?? errBody.detail ?? "Workflow request failed",
        errBody,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE messages are separated by double newlines
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const dataLine = part
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            yield JSON.parse(dataLine.slice(6)) as SSEEvent;
          } catch {
            // skip malformed events
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  /** Blocking (non-streaming) variant — for testing and CLI scripts. */
  processSync: (order: OrderRequest) =>
    request<{ run_id: string; status: string; elapsed_ms: number; result: unknown }>(
      "/process-order/sync",
      { method: "POST", body: JSON.stringify({ order }) },
    ),
};

// ---------------------------------------------------------------------------
// Denial / Appeal
// ---------------------------------------------------------------------------

export const denialApi = {
  /** Fetch a denial event by ID */
  getDenial: (denialId: string) => request<DenialEvent>(`/denial/${denialId}`),

  /** Generate a draft appeal letter for a denial event */
  generateAppeal: (denial: DenialEvent) =>
    request<AppealLetter>("/denial/appeal", {
      method: "POST",
      body: JSON.stringify(denial),
    }),
};

// ---------------------------------------------------------------------------
// Demo case denial shortcut
// ---------------------------------------------------------------------------

export const demoCaseApi = {
  getDenial: (caseId: string) => request<DenialEvent>(`/demo-cases/${caseId}/denial`),
};

// ---------------------------------------------------------------------------
// Record packaging
// ---------------------------------------------------------------------------

export interface PackageSummary {
  bundle_id: string;
  patient_id: string;
  patient_name: string;
  payer_id: string;
  payer_name: string;
  bundle_type: string;
  status: string;
  assembled_at: string;
}

export const recordsApi = {
  packageRecords: (params: {
    run_id: string;
    patient_id: string;
    order_id: string;
    payer_id: string;
  }) =>
    request<PackagedBundle>("/records/package", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  listPackages: () => request<PackageSummary[]>("/records/packages"),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? "claimshield-admin-2024";

export const adminApi = {
  reseed: () =>
    request<{ status: string; message: string; note: string }>("/admin/reseed", {
      method: "POST",
      headers: { "X-Admin-Key": ADMIN_KEY },
    }),

  clearCache: () =>
    request<{ status: string; keys_deleted: number; message: string }>("/admin/clear-cache", {
      method: "POST",
      headers: { "X-Admin-Key": ADMIN_KEY },
    }),

  status: () =>
    request<{
      redis_connected: boolean;
      redis_info: string;
      llm_model: string;
      embedding_model: string;
      embedding_model_fallback: string;
      embedding_dimensions: number;
      api_prefix: string;
      environment: string;
      app_version: string;
    }>("/admin/status"),
};
