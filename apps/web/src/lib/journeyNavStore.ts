"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  JourneyNavState,
  JourneyStepId,
  JourneyStepState,
  resolveJourneyNavStateFromPathname,
} from "@/src/lib/journeyNav";

type PersistedJourneyNav = {
  version: 1;
  completedStepIds: JourneyStepId[];
  activeOverrideStepId: JourneyStepId | null;
};

export type JourneyNavAppState = {
  completedStepIds: JourneyStepId[];
  activeOverrideStepId: JourneyStepId | null;
  markCompleted: (stepId: JourneyStepId) => void;
  setActiveOverride: (stepId: JourneyStepId | null) => void;
  reset: () => void;
};

const STORAGE_KEY = "ttr.journeyNav.v1";

const safeParse = (raw: string | null): PersistedJourneyNav | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedJourneyNav>;
    if (parsed.version !== 1) return null;
    if (!Array.isArray(parsed.completedStepIds)) return null;

    return {
      version: 1,
      completedStepIds: parsed.completedStepIds as JourneyStepId[],
      activeOverrideStepId: (parsed.activeOverrideStepId ?? null) as JourneyStepId | null,
    };
  } catch {
    return null;
  }
};

const loadPersisted = (): PersistedJourneyNav => {
  if (typeof window === "undefined") {
    return { version: 1, completedStepIds: [], activeOverrideStepId: null };
  }
  const persisted = safeParse(window.localStorage.getItem(STORAGE_KEY));
  return persisted ?? { version: 1, completedStepIds: [], activeOverrideStepId: null };
};

const persist = (payload: PersistedJourneyNav) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

const uniq = <T,>(items: T[]) => Array.from(new Set(items));

const computeFurthestCompletedIndex = (
  steps: { id: JourneyStepId }[],
  completed: Set<JourneyStepId>,
) => {
  let furthest = -1;
  for (let i = 0; i < steps.length; i += 1) {
    if (completed.has(steps[i].id)) furthest = i;
  }
  return furthest;
};

const computeUnlockedMaxIndex = (steps: { id: JourneyStepId }[], completed: Set<JourneyStepId>) => {
  const furthest = computeFurthestCompletedIndex(steps, completed);
  return Math.min(steps.length - 1, furthest + 1);
};

const computeNextStepId = (
  steps: { id: JourneyStepId }[],
  completed: Set<JourneyStepId>,
): JourneyStepId | null => {
  const unlockedMaxIndex = computeUnlockedMaxIndex(steps, completed);
  if (unlockedMaxIndex >= 0 && unlockedMaxIndex < steps.length) {
    return steps[unlockedMaxIndex].id;
  }
  return null;
};

const coerceExistingStepId = (steps: { id: JourneyStepId }[], candidate: JourneyStepId) => {
  const stepSet = new Set(steps.map((s) => s.id));
  return stepSet.has(candidate);
};

/**
 * Small helper for pages/components that want to "fire and forget"
 * a completion event without needing hook access.
 *
 * This exists because some pages import markJourneyStepCompleted directly.
 */
export function markJourneyStepCompleted(stepId: JourneyStepId) {
  if (typeof window === "undefined") return;

  const current = loadPersisted();
  const nextCompleted = uniq([...current.completedStepIds, stepId]);

  persist({
    version: 1,
    completedStepIds: nextCompleted,
    activeOverrideStepId: current.activeOverrideStepId ?? null,
  });
}

export function useJourneyNavAppState(): JourneyNavAppState {
  const [completedStepIds, setCompletedStepIds] = useState<JourneyStepId[]>(
    () => loadPersisted().completedStepIds,
  );
  const [activeOverrideStepId, setActiveOverrideStepId] = useState<JourneyStepId | null>(
    () => loadPersisted().activeOverrideStepId,
  );

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = loadPersisted();
      setCompletedStepIds(next.completedStepIds);
      setActiveOverrideStepId(next.activeOverrideStepId);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const markCompleted = useCallback(
    (stepId: JourneyStepId) => {
      setCompletedStepIds((prev) => {
        const next = uniq([...prev, stepId]);
        persist({
          version: 1,
          completedStepIds: next,
          activeOverrideStepId,
        });
        return next;
      });
    },
    [activeOverrideStepId],
  );

  const setActiveOverride = useCallback(
    (stepId: JourneyStepId | null) => {
      setActiveOverrideStepId(() => {
        persist({
          version: 1,
          completedStepIds,
          activeOverrideStepId: stepId,
        });
        return stepId;
      });
    },
    [completedStepIds],
  );

  const reset = useCallback(() => {
    const payload: PersistedJourneyNav = { version: 1, completedStepIds: [], activeOverrideStepId: null };
    persist(payload);
    setCompletedStepIds([]);
    setActiveOverrideStepId(null);
  }, []);

  return useMemo(
    () => ({
      completedStepIds,
      activeOverrideStepId,
      markCompleted,
      setActiveOverride,
      reset,
    }),
    [completedStepIds, activeOverrideStepId, markCompleted, setActiveOverride, reset],
  );
}

export function resolveJourneyNavStateFromAppState(
  pathname: string,
  appState: Pick<JourneyNavAppState, "completedStepIds" | "activeOverrideStepId">,
): JourneyNavState {
  const base = resolveJourneyNavStateFromPathname(pathname);
  const completed = new Set(appState.completedStepIds);

  const unlockedMaxIndex = computeUnlockedMaxIndex(base.steps, completed);

  const baseActive = base.activeStepId;
  const desiredActive = appState.activeOverrideStepId ?? baseActive;

  const activeStepId = base.steps.some((s) => s.id === desiredActive) ? desiredActive : baseActive;

  const activeIndex = base.steps.findIndex((s) => s.id === activeStepId);
  const clampedActiveIndex = Math.min(activeIndex, unlockedMaxIndex >= 0 ? unlockedMaxIndex : activeIndex);
  const clampedActiveId = base.steps[clampedActiveIndex]?.id ?? activeStepId;

  const finalSteps = base.steps.map((step, idx) => {
    if (completed.has(step.id)) {
      return { ...step, state: JourneyStepState.Completed };
    }

    if (idx > unlockedMaxIndex) {
      return { ...step, state: JourneyStepState.Locked };
    }

    if (step.id === clampedActiveId) {
      return { ...step, state: JourneyStepState.Active };
    }

    return { ...step, state: JourneyStepState.Available };
  });

  return {
    ...base,
    activeStepId: clampedActiveId,
    steps: finalSteps,
    completedStepIds: base.steps.filter((s) => completed.has(s.id)).map((s) => s.id),
  };
}

export function inferAndSyncJourneyCompletions(args: {
  pathname: string;
  steps: { id: JourneyStepId }[];
  hasBaseline: boolean;
  hasJob: boolean;
  lastAnalysis: unknown | null;
  appState: JourneyNavAppState;
}) {
  const { pathname, steps, hasBaseline, hasJob, lastAnalysis, appState } = args;

  const stepIds = new Set(steps.map((s) => s.id));

  const ensureMark = (id: JourneyStepId, newlyCompleted: Set<JourneyStepId>) => {
    if (!stepIds.has(id)) return;
    if (appState.completedStepIds.includes(id)) return;
    if (newlyCompleted.has(id)) return;
    newlyCompleted.add(id);
    appState.markCompleted(id);
  };

  const newlyCompleted = new Set<JourneyStepId>();

  // These MUST match your RouteConfig["id"] values.
  // Your UI and API endpoints strongly suggest plural ids: baselines and jobs.
  if (hasBaseline) {
    if (stepIds.has("baselines" as JourneyStepId)) ensureMark("baselines" as JourneyStepId, newlyCompleted);
    else if (stepIds.has("baseline" as JourneyStepId)) ensureMark("baseline" as JourneyStepId, newlyCompleted);
  }

  if (hasJob) {
    if (stepIds.has("jobs" as JourneyStepId)) ensureMark("jobs" as JourneyStepId, newlyCompleted);
    else if (stepIds.has("job" as JourneyStepId)) ensureMark("job" as JourneyStepId, newlyCompleted);
  }

  // Analysis completion detected from sessionStorage payload
  if (lastAnalysis && typeof lastAnalysis === "object") {
    const maybe = lastAnalysis as { result?: Record<string, unknown> };
    const result = maybe.result ?? {};
    const hasScore =
      typeof result.score === "number" ||
      typeof result.fitScore === "number" ||
      typeof result.cxFitScore === "number" ||
      typeof result.compatibilityScore === "number";

    if (hasScore && stepIds.has("analyze" as JourneyStepId)) {
      ensureMark("analyze" as JourneyStepId, newlyCompleted);
    }
  }

  // Output and interview steps inferred by route
  if (pathname.startsWith("/resume") && stepIds.has("resume" as JourneyStepId)) {
    ensureMark("resume" as JourneyStepId, newlyCompleted);
  }

  if (
    (pathname.startsWith("/cover-letters") || pathname.startsWith("/coverLetters")) &&
    stepIds.has("coverLetters" as JourneyStepId)
  ) {
    ensureMark("coverLetters" as JourneyStepId, newlyCompleted);
  }

  if (
    (pathname.startsWith("/interview-toolkit") || pathname.startsWith("/interviewToolkit")) &&
    stepIds.has("interviewToolkit" as JourneyStepId)
  ) {
    ensureMark("interviewToolkit" as JourneyStepId, newlyCompleted);
  }

  if ((pathname.startsWith("/search-sets") || pathname.startsWith("/searchSets")) && stepIds.has("searchSets" as JourneyStepId)) {
    ensureMark("searchSets" as JourneyStepId, newlyCompleted);
  }

  // Auto advance using predicted completion set (includes newly completed in this pass)
  const completedSet = new Set(appState.completedStepIds);
  for (const id of newlyCompleted) completedSet.add(id);

  const next = computeNextStepId(steps, completedSet);
  if (next && next !== appState.activeOverrideStepId) {
    if (coerceExistingStepId(steps, next)) {
      appState.setActiveOverride(next);
    }
  }

  // TODO: Hook “reality check complete” when that feature is added.
  // File: apps/web/app/(app)/reality-check/page.tsx
  // Function: onRealityCheckComplete()
}
