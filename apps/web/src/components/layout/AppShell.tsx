"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { JOURNEY_NAV_V1_ENABLED, JourneyNavV1 } from "./JourneyNavV1";
import { RouteConfig, sidebarRoutes, settingsRoute } from "@/src/navigation/routes";
import { JourneyStepId, JourneyStepState } from "@/src/lib/journeyNav";
import {
  resolveJourneyNavStateFromAppState,
  useJourneyNavAppState,
} from "@/src/lib/journeyNavStore";
import { readLastAnalysis, type StoredAnalysisRecord } from "@/app/(app)/lib/session";

const isDev = process.env.NODE_ENV === "development";

type StoredContext = {
  hasBaseline: boolean;
  hasJob: boolean;
  lastAnalysis: StoredAnalysisRecord | null;
};

const getStoredContext = (): StoredContext => {
  if (typeof window === "undefined") {
    return { hasBaseline: false, hasJob: false, lastAnalysis: null };
  }

  const stored = readLastAnalysis();
  if (!stored) {
    return { hasBaseline: false, hasJob: false, lastAnalysis: null };
  }

  return {
    hasBaseline: Boolean(stored.baselineId),
    hasJob: Boolean(stored.jobId),
    lastAnalysis: stored,
  };
};

const disabledMessages: Record<string, string> = {
  analyze: "Add a baseline and a job description to calculate your score.",
  resume: "Select a baseline and job to generate documents.",
  coverLetters: "Select a baseline and job to generate documents.",
  interviewToolkit: "Add a job with an interview date to unlock tools.",
  searchSets: "Upload a baseline to run Search Sets.",
};

const getDisabledReason = (route: RouteConfig, hasBaseline: boolean, hasJob: boolean) => {
  if (route.requiresBaseline && !hasBaseline) {
    return disabledMessages[route.id] ?? "Upload a baseline to unlock this area";
  }
  if (route.requiresJob && !hasJob) {
    return disabledMessages[route.id] ?? "Add a job to proceed";
  }
  return null;
};

type AppShellProps = {
  children: ReactNode;
  userEmail?: string | null;
};

async function safeJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function AppShell({ children, userEmail }: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasBaseline, setHasBaseline] = useState(false);
  const [hasJob, setHasJob] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const lastPath = useRef(pathname);

  const journeyAppState = useJourneyNavAppState();

  const refreshContext = useCallback(async () => {
    if (typeof window === "undefined") return;

    const stored = getStoredContext();

    let baselinesOk = false;
    let jobsOk = false;

    try {
      const baselineRes = await fetch("/api/baselines", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (baselineRes.ok) {
        const data = await safeJson<unknown>(baselineRes);
        if (Array.isArray(data)) {
          baselinesOk = data.length > 0;
        } else if (data && typeof data === "object") {
          const maybe = data as { items?: unknown[]; baselines?: unknown[] };
          if (Array.isArray(maybe.items)) baselinesOk = maybe.items.length > 0;
          if (Array.isArray(maybe.baselines)) baselinesOk = maybe.baselines.length > 0;
        } else {
          baselinesOk = stored.hasBaseline;
        }
      } else {
        baselinesOk = stored.hasBaseline;
      }
    } catch {
      baselinesOk = stored.hasBaseline;
    }

    try {
      const jobsRes = await fetch("/api/jobs", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (jobsRes.ok) {
        const data = await safeJson<unknown>(jobsRes);
        if (Array.isArray(data)) {
          jobsOk = data.length > 0;
        } else if (data && typeof data === "object") {
          const maybe = data as { items?: unknown[]; jobs?: unknown[] };
          if (Array.isArray(maybe.items)) jobsOk = maybe.items.length > 0;
          if (Array.isArray(maybe.jobs)) jobsOk = maybe.jobs.length > 0;
        } else {
          jobsOk = stored.hasJob;
        }
      } else {
        jobsOk = stored.hasJob;
      }
    } catch {
      jobsOk = stored.hasJob;
    }

    setHasBaseline(Boolean(baselinesOk));
    setHasJob(Boolean(jobsOk));
  }, []);

  useEffect(() => {
    refreshContext();
  }, [refreshContext]);

  useEffect(() => {
    const onFocus = () => {
      refreshContext();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshContext]);

  useEffect(() => {
    if (!isDev) return;
    if (lastPath.current !== pathname) {
      console.info("Navigation:", pathname);
      lastPath.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    if (!isDev || typeof window === "undefined") return;

    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        if (!response.ok) {
          console.warn("Fetch failed", {
            url: args[0],
            status: response.status,
            route: window.location.pathname,
          });
        }
        return response;
      } catch (error) {
        console.error("Fetch error", error);
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string })?.error ?? "Logout failed");
      }

      router.push("/auth/login");
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Logout failed");
    } finally {
      setLoggingOut(false);
      setMenuOpen(false);
    }
  };

  const navRoutes = sidebarRoutes;

  const activeRouteIds = useMemo(() => {
    const normalized = pathname === "/" ? "/" : pathname.replace(/\/$/, "");
    return new Set(
      navRoutes
        .filter((route) => {
          if (route.href === "/") {
            return normalized === "/";
          }
          return normalized === route.href || normalized.startsWith(`${route.href}/`);
        })
        .map((route) => route.id),
    );
  }, [navRoutes, pathname]);

  const journeyNavState = useMemo(
    () => resolveJourneyNavStateFromAppState(pathname, journeyAppState),
    [pathname, journeyAppState],
  );

  const handleJourneyStepClick = useCallback(
    (stepId: JourneyStepId) => {
      const step = journeyNavState.steps.find((s) => s.id === stepId);
      if (!step) return;

      if (step.state !== JourneyStepState.Completed) return;

      journeyAppState.setActiveOverride(stepId);
    },
    [journeyNavState.steps, journeyAppState],
  );

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-50">
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-white/10 bg-slate-950/70 px-4 py-6">
        <div className="text-xs font-semibold uppercase tracking-[0.45em] text-slate-400">
          Target This Role
        </div>
        <nav className="mt-6 flex flex-col gap-2">
          {navRoutes.map((route) => {
            const isActive = activeRouteIds.has(route.id);
            const disabledReason = getDisabledReason(route, hasBaseline, hasJob);
            const isDisabled = Boolean(disabledReason);

            const baseClasses =
              "flex flex-col rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition";
            const enabledClasses =
              "border-white/10 bg-transparent text-slate-100 hover:bg-slate-900/40";
            const activeClasses =
              "border-amber-400/60 bg-amber-400/20 text-amber-200 shadow-sm";
            const disabledClasses = "opacity-60";
            const disabledLabelClasses = "text-[11px] font-medium text-slate-400 leading-tight";

            return (
              <Link
                key={route.id}
                href={route.href}
                onClick={() => setMenuOpen(false)}
                className={`${baseClasses} ${isActive ? activeClasses : enabledClasses} ${
                  isDisabled ? disabledClasses : ""
                }`}
                aria-current={isActive ? "page" : undefined}
                title={disabledReason ?? undefined}
                aria-disabled={isDisabled ? "true" : undefined}
              >
                <span>{route.label}</span>
                {route.subtext ? (
                  <span className="text-[11px] font-medium text-slate-400 leading-tight">
                    {route.subtext}
                  </span>
                ) : null}
                {disabledReason ? <span className={disabledLabelClasses}>{disabledReason}</span> : null}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-slate-400">Session console</span>
            {isDev ? (
              <span className="text-[11px] uppercase tracking-[0.4em] text-amber-300">
                Dev route: {pathname}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            {isDev ? (
              <span className="text-[11px] uppercase tracking-[0.4em] text-slate-400">
                Dev health
              </span>
            ) : null}
            <Link
              href={settingsRoute.href}
              className="rounded-full border border-white/20 px-4 py-1 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/40"
            >
              Settings
            </Link>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-white/20 bg-slate-800/80 px-4 py-2 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-white/40"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span>{userEmail ?? "Account"}</span>
                <span aria-hidden="true" className="text-xs">
                  ˅
                </span>
              </button>

              {menuOpen ? (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl border border-white/10 bg-slate-900/80 p-3 shadow-xl">
                  <Link
                    href={settingsRoute.href}
                    className="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800/60"
                    onClick={() => setMenuOpen(false)}
                  >
                    {settingsRoute.label}
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="mt-1 w-full rounded-lg border border-transparent bg-amber-400/20 px-3 py-2 text-left text-sm font-semibold text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loggingOut ? "Logging out" : "Logout"}
                  </button>
                  {logoutError ? <p className="mt-2 text-xs text-red-400">{logoutError}</p> : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-950/50 px-6 py-8">
          {JOURNEY_NAV_V1_ENABLED ? (
            <div className="mb-6 border-b border-white/10 bg-slate-950/60 px-0 py-3">
              <JourneyNavV1 state={journeyNavState} onStepClick={handleJourneyStepClick} />
            </div>
          ) : null}

          {children}
        </main>
      </div>
    </div>
  );
}

export type AppShellBoundaryProps = AppShellProps;

export function AppShellBoundary({ children, userEmail }: AppShellBoundaryProps) {
  const pathname = usePathname();
  const isAuthPath = pathname?.startsWith("/auth");

  if (isAuthPath) {
    return <>{children}</>;
  }

  return <AppShell userEmail={userEmail}>{children}</AppShell>;
}
