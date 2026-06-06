"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Settings,
  Database,
  Cpu,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api";

interface SystemStatus {
  redis_connected: boolean;
  redis_info: string;
  llm_model: string;
  embedding_model: string;
  embedding_model_fallback: string;
  embedding_dimensions: number;
  api_prefix: string;
  environment: string;
  app_version: string;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [reseedLoading, setReseedLoading] = useState(false);
  const [cacheLoading, setCacheLoading] = useState(false);

  const loadStatus = async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const data = await adminApi.status();
      setStatus(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch status";
      setStatusError(msg);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleReseed = async () => {
    setReseedLoading(true);
    try {
      const res = await adminApi.reseed();
      toast.success("Seed data refreshed", { description: res.message });
      if (res.note) {
        toast.info("Note", { description: res.note });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Reseed failed";
      toast.error("Reseed failed", { description: msg });
    } finally {
      setReseedLoading(false);
    }
  };

  const handleClearCache = async () => {
    setCacheLoading(true);
    try {
      const res = await adminApi.clearCache();
      toast.success("Cache cleared", { description: res.message });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Cache clear failed";
      toast.error("Cache clear failed", { description: msg });
    } finally {
      setCacheLoading(false);
    }
  };

  return (
    <div className="w-full p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Settings className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        </div>
        <p className="text-sm text-muted-foreground">System configuration and environment status.</p>
      </div>

      {/* System status */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              System Status
            </CardTitle>
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={loadStatus} disabled={statusLoading}>
              {statusLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {statusLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading system status…
            </div>
          )}
          {statusError && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Backend unreachable</p>
                <p className="mt-0.5 text-red-600">{statusError}</p>
              </div>
            </div>
          )}
          {status && !statusLoading && (
            <div className="space-y-3">
              {/* Connection status */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`flex items-center gap-2.5 p-3 rounded-lg border ${status.redis_connected ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${status.redis_connected ? "bg-emerald-100" : "bg-red-100"}`}>
                    <Database className={`w-4 h-4 ${status.redis_connected ? "text-emerald-600" : "text-red-600"}`} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Redis Cache</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {status.redis_connected ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-red-600" />}
                      <p className="text-[10px] text-muted-foreground">{status.redis_info}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-lg border bg-emerald-50 border-emerald-200">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Database className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">PostgreSQL / pgvector</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <p className="text-[10px] text-muted-foreground">localhost:5432 · connected</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Model config */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Model Configuration</p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-border">
                      <tr>
                        <td className="py-2.5 px-3 text-muted-foreground font-medium w-1/3">LLM (generation)</td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{status.llm_model}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-muted-foreground font-medium">Embedding (primary)</td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{status.embedding_model}</span>
                          <Badge className="ml-2 text-[10px] bg-blue-100 text-blue-700 border-blue-200">{status.embedding_dimensions}d</Badge>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-muted-foreground font-medium">Embedding (fallback)</td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{status.embedding_model_fallback}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-muted-foreground font-medium">API prefix</td>
                        <td className="py-2.5 px-3 font-mono text-foreground">{status.api_prefix}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-muted-foreground font-medium">Environment</td>
                        <td className="py-2.5 px-3">
                          <Badge className="text-[10px] bg-muted text-muted-foreground border-border">{status.environment}</Badge>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-muted-foreground font-medium">App version</td>
                        <td className="py-2.5 px-3 text-foreground">{status.app_version}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin actions */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Admin Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 mb-3">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <p>These actions affect the demo environment. In production, admin endpoints would be protected by authentication.</p>
          </div>

          <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Re-run Seed Data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Re-registers mock EHR/clearinghouse data in memory. For full database re-seed
                (policy embeddings), run <code className="bg-muted px-1 py-0.5 rounded font-mono">python -m app.ingestion.seed --wipe</code> from the CLI.
              </p>
            </div>
            <Button size="sm" variant="outline" className="text-xs gap-1.5 flex-shrink-0" onClick={handleReseed} disabled={reseedLoading}>
              {reseedLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Running…</> : <><RefreshCw className="w-3.5 h-3.5" />Re-run Seed</>}
            </Button>
          </div>

          <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Clear Redis Cache</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Flushes all <code className="bg-muted px-1 py-0.5 rounded font-mono">policy_chunks:*</code> keys from Redis.
                The next retrieval request for each payer/CPT pair will hit pgvector and repopulate the cache.
              </p>
            </div>
            <Button size="sm" variant="outline" className="text-xs gap-1.5 flex-shrink-0 border-red-200 text-red-700 hover:bg-red-50" onClick={handleClearCache} disabled={cacheLoading}>
              {cacheLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Clearing…</> : <><Trash2 className="w-3.5 h-3.5" />Clear Cache</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* HITL reminder */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p>
          <span className="font-semibold">Human-in-the-loop policy:</span> ClaimShield AI never
          auto-submits to a payer. All AI outputs are drafts requiring staff review before any
          payer interaction. This setting is not configurable.
        </p>
      </div>
    </div>
  );
}
