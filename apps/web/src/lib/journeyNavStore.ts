"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { JourneyNavState, JourneyStepId, resolveJourneyNavState } from "@/src/lib/journeyNav";

const LEGACY_STORAGE_KEY = "ttr.journeyNav.v1";
const STORAGE_KEY = "ttr.journeyNav.v2";
const CURRENT_VERSION = 2;

type PersistedJourneyNav = {
  version: typeof CURRENT_VERSION;
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

const uniq = <T,>(items: T[]) => Array.from(new Set(items));

const createDefaultPersistedJourneyNav = (): PersistedJourneyNav => ({
  version: CURRENT_VERSION,
  completedStepIds: [],
  activeOverrideStepId: null,
});

const normalizeCompletedStepIds = (value: unknown): JourneyStepId[] => {
  if (!Array.isArray(value)) return [];
  const candidates = value.filter((item): item is JourneyStepId => typeof item === "string");
  return uniq(candidates);
};

const normalizeActiveOverrideStepId = (value: unknown): JourneyStepId | null => {
  if (value === null) return null;
  return typeof value === "string" ? (value as JourneyStepId) : null;
};

const normalizePersistedJourneyNav = (value: Partial<PersistedJourneyNav>): PersistedJourneyNav => ({
  version: CURRENT_VERSION,
  completedStepIds: normalizeCompletedStepIds(value.completedStepIds),
  activeOverrideStepId: normalizeActiveOverrideStepId(value.activeOverrideStepId),
});

const safeParse = (raw: string | null): PersistedJourneyNav => {
  if (!raw) return createDefaultPersistedJourneyNav();
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return createDefaultPersistedJourneyNav();
    const version = (parsed as { version?: unknown }).version;
    if (version === CURRENT_VERSION) {
      return normalizePersistedJourneyNav(parsed as Partial<PersistedJourneyNav>);
    }
    if (version === 1) {
      return createDefaultPersistedJourneyNav();
    }
    return createDefaultPersistedJourneyNav();
  } catch {
    return createDefaultPersistedJourneyNav();
  }
};

const persist = (payload: PersistedJourneyNav) => {
  if (typeof window === "undefined") return;
  const normalized = normalizePersistedJourneyNav(payload);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
};

const loadPersisted = (): PersistedJourneyNav => {
  if (typeof window === "undefined") {
    return createDefaultPersistedJourneyNav();
  }

  const primaryRaw = window.localStorage.getItem(STORAGE_KEY);
  if (primaryRaw !== null) {
    return safeParse(primaryRaw);
  }

  const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacyRaw !== null) {
    const migrated = safeParse(legacyRaw);
    persist(migrated);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return migrated;
  }

  return createDefaultPersistedJourneyNav();
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
    version: CURRENT_VERSION,
    completedStepIds: nextCompleted,
    activeOverrideStepId: current.activeOverrideStepId ?? null,
  });
}

export function useJourneyNavAppState(): JourneyNavAppState {
  const [completedStepIds, setCompletedStepIds] = useState<JourneyStepId[]>([]);
  const [activeOverrideStepId, setActiveOverrideStepId] = useState<JourneyStepId | null>(null);

  useEffect(() => {
    const initial = loadPersisted();
    setCompletedStepIds(initial.completedStepIds);
    setActiveOverrideStepId(initial.activeOverrideStepId);

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
          version: CURRENT_VERSION,
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
          version: CURRENT_VERSION,
          completedStepIds,
          activeOverrideStepId: stepId,
        });
        return stepId;
      });
    },
    [completedStepIds],
  );

  const reset = useCallback(() => {
    persist(createDefaultPersistedJourneyNav());
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
  return resolveJourneyNavState({
    currentPathname: pathname,
    completedStepIds: appState.completedStepIds,
    activeStepId: appState.activeOverrideStepId ?? undefined,
  });
}
