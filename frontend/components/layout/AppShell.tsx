"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
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

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("checking");

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

  const pageLabel =
    pathname === "/"
      ? "Dashboard"
      : NAV_ITEMS.find((n) => n.href !== "/" && pathname.startsWith(n.href))?.label ?? pathname.replace("/", "");

  return (
    <div className="flex h-full min-h-screen">
      <aside className="w-60 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
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
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="w-3 h-3 opacity-50" />}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-sidebar-border space-y-2">
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
            v0.1 · Synthetic data
          </p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-13 flex items-center justify-between px-5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">ClaimShield AI</span>
            <span className="text-muted-foreground/50 text-sm">/</span>
            <span className="text-sm text-muted-foreground">{pageLabel}</span>
          </div>

          <div className="flex items-center gap-2.5">
            {healthStatus === "online" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
                <Wifi className="w-3 h-3" />
                Connected
              </span>
            )}
            {healthStatus === "offline" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-medium border border-red-200">
                <WifiOff className="w-3 h-3" />
                Offline
              </span>
            )}
            {healthStatus === "checking" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium border border-border">
                <Loader2 className="w-3 h-3 animate-spin" />
                Connecting
              </span>
            )}

            <Link
              href="/order"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-muted/50 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              New Order
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
