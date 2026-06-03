"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  FileText,
  AlertTriangle,
  FolderOpen,
  Clock,
  ChevronRight,
  Settings,
  Wifi,
  WifiOff,
  Loader2,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { healthApi } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/order", label: "New Order", icon: FileText },
  { href: "/denial", label: "Denial & Appeal", icon: AlertTriangle },
  { href: "/records", label: "Record Packages", icon: FolderOpen },
  { href: "/deadlines", label: "Filing Deadlines", icon: Clock },
  { href: "/settings", label: "Settings", icon: Settings },
];

type HealthStatus = "checking" | "online" | "offline";

// Live demo metrics — increment during the demo to show activity
const BASE_REQUESTS = 847;
const BASE_APPEALS  = 312;
const BASE_HOURS    = 603;

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("checking");
  const [metrics, setMetrics] = useState({
    requests: BASE_REQUESTS,
    appeals: BASE_APPEALS,
    hours: BASE_HOURS,
  });
  const metricsRef = useRef(metrics);

  const checkHealth = useCallback(async () => {
    try {
      await healthApi.check();
      setHealthStatus("online");
    } catch {
      setHealthStatus("offline");
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30_000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Slowly increment metrics counters during the demo session
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => {
        const updated = {
          requests: prev.requests + (Math.random() < 0.3 ? 1 : 0),
          appeals:  prev.appeals  + (Math.random() < 0.15 ? 1 : 0),
          hours:    prev.hours    + (Math.random() < 0.2 ? 1 : 0),
        };
        metricsRef.current = updated;
        return updated;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const pageLabel =
    pathname === "/"
      ? "Dashboard"
      : NAV_ITEMS.find((n) => n.href !== "/" && pathname.startsWith(n.href))?.label ?? pathname.replace("/", "");

  return (
    <div className="flex h-full min-h-screen">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sidebar-primary">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-sidebar-foreground leading-tight">
              ClaimShield AI
            </p>
            <p className="text-[10px] text-sidebar-foreground/50 uppercase tracking-widest">
              Prior Auth
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors group",
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="w-3 h-3 opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-sidebar-border space-y-2">
          {/* Backend status */}
          <div className="flex items-center gap-1.5">
            {healthStatus === "checking" && (
              <>
                <Loader2 className="w-3 h-3 text-sidebar-foreground/40 animate-spin" />
                <span className="text-[10px] text-sidebar-foreground/40">Connecting…</span>
              </>
            )}
            {healthStatus === "online" && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400">Backend online</span>
              </>
            )}
            {healthStatus === "offline" && (
              <>
                <WifiOff className="w-3 h-3 text-red-400" />
                <span className="text-[10px] text-red-400">Backend offline</span>
              </>
            )}
          </div>
          <p className="text-[10px] text-sidebar-foreground/30 uppercase tracking-widest">
            MVP v0.1 · Hackathon Demo
          </p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* DEMO / PHI disclaimer banner */}
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-1 flex items-center justify-between">
          <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wide">
            ⚠ DEMO DATA ONLY — NOT REAL PHI — All patient data is entirely synthetic
          </p>
          <p className="text-[10px] text-amber-700 hidden sm:block">
            Human-in-the-loop: no AI output is submitted to a payer without staff approval
          </p>
        </div>

        {/* Top bar */}
        <header className="h-13 flex items-center justify-between px-5 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">ClaimShield AI</span>
            <span className="text-muted-foreground/50 text-sm">/</span>
            <span className="text-sm text-muted-foreground">{pageLabel}</span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Live metrics counter */}
            <div className="hidden lg:flex items-center gap-1 text-[10px] text-muted-foreground border border-border rounded-full px-2.5 py-1 bg-muted/30">
              <Activity className="w-3 h-3 text-emerald-500" />
              <span className="tabular-nums">{metrics.requests.toLocaleString()} requests</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="tabular-nums">{metrics.appeals.toLocaleString()} appeals</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="tabular-nums">{metrics.hours.toLocaleString()} hrs saved</span>
            </div>
            {/* Health indicator */}
            {healthStatus === "online" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
                <Wifi className="w-3 h-3" />
                Backend connected
              </span>
            )}
            {healthStatus === "offline" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-medium border border-red-200">
                <WifiOff className="w-3 h-3" />
                Backend offline
              </span>
            )}
            {healthStatus === "checking" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium border border-border">
                <Loader2 className="w-3 h-3 animate-spin" />
                Connecting
              </span>
            )}

            {/* Load Demo Case */}
            <Link
              href="/order"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/80 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Load Demo Case
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
