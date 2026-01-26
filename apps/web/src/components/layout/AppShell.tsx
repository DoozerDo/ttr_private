"use client";

import { usePathname } from "next/navigation";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { JOURNEY_NAV_V1_ENABLED, JourneyNavV1 } from "./JourneyNavV1";
import { TopNavAccountArea } from "./TopNavAccountArea";
import { JourneyNavState } from "@/src/lib/journeyNav";
import { resolveJourneyNavStateFromAppState, useJourneyNavAppState } from "@/src/lib/journeyNavStore";
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

export function filterJourneyNavStateForPath(
  _pathname: string,
  state: JourneyNavState,
): JourneyNavState {
  // Beta scope removes this journey step per spec Section 7.
  return state;
}

function isStepCompleted(state: unknown): boolean {
  if (typeof state === "string") {
    return state.toLowerCase() === "completed";
  }
  if (typeof state === "number") {
    // If state is a numeric enum, we do not have the enum value in scope here.
    // Conservatively treat non-zero as "not safe" unless it is a common "completed" value.
    // If your enum differs, import the enum and replace this logic.
    return state === 2;
  }
  return false;
}

export function AppShell({ children, userEmail }: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const [, setHasBaseline] = useState(false);
  const [, setHasJob] = useState(false);
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
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      void refreshContext();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshContext]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timers = new Set<number>();
    const onFocus = () => {
      const timer = window.setTimeout(() => {
        void refreshContext();
        timers.delete(timer);
      }, 0);
      timers.add(timer);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
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

  const journeyNavState = useMemo(() => {
    const baseState = resolveJourneyNavStateFromAppState(pathname, journeyAppState);
    return filterJourneyNavStateForPath(pathname, baseState);
  }, [pathname, journeyAppState]);

  type JourneyStepId = JourneyNavState["steps"][number]["id"];

  const handleJourneyStepClick = useCallback(
    (stepId: JourneyStepId) => {
      const step = journeyNavState.steps.find((s) => s.id === stepId);
      if (!step) return;

      if (!isStepCompleted(step.state)) return;

      journeyAppState.setActiveOverride(stepId);
    },
    [journeyNavState.steps, journeyAppState],
  );

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-50">
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
            <TopNavAccountArea initialEmail={userEmail} />
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
