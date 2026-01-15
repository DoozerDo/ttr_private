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

const DEFAULT_STEP_ID: JourneyStepId = JOURNEY_NAV_STEPS[0]?.id ?? ("baselines" as JourneyStepId);

const PATHNAME_TO_STEP_MAP: Record<string, JourneyStepId> = navigationRoutes.reduce<
  Record<string, JourneyStepId>
>((acc, route) => {
  acc[route.href] = route.id;
  return acc;
}, {});

export function getStepIdForPathname(pathname?: string): JourneyStepId | null {
  const normalized =
    !pathname || pathname === "/"
      ? "/"
      : pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  // `/` should only match the root entry.
  if (normalized === "/") {
    return PATHNAME_TO_STEP_MAP["/"] ?? null;
  }

  for (const [prefix, stepId] of Object.entries(PATHNAME_TO_STEP_MAP)) {
    if (prefix === "/") continue;
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return stepId;
    }
  }

  return null;
};

export type ResolveJourneyNavStateInput = {
  currentPathname?: string;
  completedStepIds?: JourneyStepId[];
  activeStepId?: JourneyStepId;
};

export function resolveJourneyNavState(input: ResolveJourneyNavStateInput): JourneyNavState {
  const { currentPathname, completedStepIds = [], activeStepId: explicitActiveStepId } = input;

  const candidateFromPath = getStepIdForPathname(currentPathname) ?? DEFAULT_STEP_ID;
  const desiredActive =
    explicitActiveStepId && JOURNEY_NAV_STEPS.some((step) => step.id === explicitActiveStepId)
      ? explicitActiveStepId
      : candidateFromPath;
  const activeStepId = JOURNEY_NAV_STEPS.some((step) => step.id === desiredActive)
    ? desiredActive
    : DEFAULT_STEP_ID;

  const normalizedCompleted = completedStepIds.filter((id): id is JourneyStepId => typeof id === "string");
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
      (step) => step.id,
    ),
  };
}

export function resolveJourneyNavStateFromPathname(pathname?: string): JourneyNavState {
  const activeStepId = getStepIdForPathname(pathname) ?? DEFAULT_STEP_ID;

  return resolveJourneyNavState({
    currentPathname: pathname,
    activeStepId,
    completedStepIds: [],
  });
}
