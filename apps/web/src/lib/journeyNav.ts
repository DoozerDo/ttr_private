import { RouteConfig, sidebarRoutes } from "@/src/navigation/routes";

export type JourneyStepId = RouteConfig["id"];

export type JourneyStep = {
  id: JourneyStepId;
  label: string;
  icon?: string;
};

export enum JourneyStepState {
  Locked = "Locked",
  Available = "Available",
  Active = "Active",
  Completed = "Completed",
}

export type JourneyNavState = {
  steps: Array<JourneyStep & { state: JourneyStepState }>;
  activeStepId: JourneyStepId;
  completedStepIds: JourneyStepId[];
};

const baseNavigationRoutes = [...sidebarRoutes];

const navigationRoutes = (() => {
  const seenIds = new Set<RouteConfig["id"]>();
  const deduped: RouteConfig[] = [];
  for (const route of baseNavigationRoutes) {
    if (seenIds.has(route.id)) continue;
    seenIds.add(route.id);
    deduped.push(route);
  }
  return deduped;
})();

export const JOURNEY_NAV_STEPS: JourneyStep[] = navigationRoutes.map((route) => ({
  id: route.id,
  label: route.label,
}));

const DEFAULT_STEP_ID: JourneyStepId =
  JOURNEY_NAV_STEPS[0]?.id ?? ("baselines" as JourneyStepId);

const PATHNAME_TO_STEP_MAP: Record<string, JourneyStepId> =
  navigationRoutes.reduce<Record<string, JourneyStepId>>((acc, route) => {
    acc[route.href] = route.id;
    return acc;
  }, {
    "/score": "results" as JourneyStepId,
    "/document-generator": "studio" as JourneyStepId,
  });

function normalizePathname(pathname?: string): string {
  if (!pathname || pathname === "/") return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function getStepIdForPathname(pathname?: string): JourneyStepId | null {
  const normalized = normalizePathname(pathname);

  // `/` should only match the root entry.
  if (normalized === "/") {
    return PATHNAME_TO_STEP_MAP["/"] ?? null;
  }

  // Prefer the most specific match (longest prefix) to avoid accidental collisions.
  // Example: if `/jobs` and `/jobs/new` both exist, `/jobs/new` should win.
  let bestMatch: { prefixLen: number; stepId: JourneyStepId } | null = null;

  for (const [prefix, stepId] of Object.entries(PATHNAME_TO_STEP_MAP)) {
    if (!prefix || prefix === "/") continue;

    const normalizedPrefix = normalizePathname(prefix);

    if (
      normalized === normalizedPrefix ||
      normalized.startsWith(`${normalizedPrefix}/`)
    ) {
      const prefixLen = normalizedPrefix.length;
      if (!bestMatch || prefixLen > bestMatch.prefixLen) {
        bestMatch = { prefixLen, stepId };
      }
    }
  }

  return bestMatch?.stepId ?? null;
}

export type ResolveJourneyNavStateInput = {
  currentPathname?: string;
  completedStepIds?: JourneyStepId[];
  activeStepId?: JourneyStepId;
};

export function resolveJourneyNavState(
  input: ResolveJourneyNavStateInput
): JourneyNavState {
  const { currentPathname, completedStepIds = [], activeStepId: explicitActiveStepId } =
    input;

  // Route always wins. If pathname resolves to a known step, that is the ONLY active step.
  // Explicit active override is only respected when pathname is unknown (eg non-journey routes).
  const fromPath = getStepIdForPathname(currentPathname);
  const fallbackFromPathOrDefault = fromPath ?? DEFAULT_STEP_ID;

  const desiredActive =
    fromPath ??
    (explicitActiveStepId &&
    JOURNEY_NAV_STEPS.some((step) => step.id === explicitActiveStepId)
      ? explicitActiveStepId
      : fallbackFromPathOrDefault);

  const activeStepId = JOURNEY_NAV_STEPS.some((step) => step.id === desiredActive)
    ? desiredActive
    : DEFAULT_STEP_ID;

  const normalizedCompleted = completedStepIds.filter(
    (id): id is JourneyStepId => typeof id === "string"
  );
  const completedSet = new Set(normalizedCompleted);

  const steps = JOURNEY_NAV_STEPS.map((step) => {
    if (step.id === activeStepId) {
      return { ...step, state: JourneyStepState.Active };
    }

    if (completedSet.has(step.id)) {
      return { ...step, state: JourneyStepState.Completed };
    }

    return { ...step, state: JourneyStepState.Available };
  });

  return {
    steps,
    activeStepId,
    completedStepIds: JOURNEY_NAV_STEPS.filter((step) => completedSet.has(step.id)).map(
      (step) => step.id
    ),
  };
}

export function resolveJourneyNavStateFromPathname(pathname?: string): JourneyNavState {
  return resolveJourneyNavState({
    currentPathname: pathname,
    completedStepIds: [],
  });
}
