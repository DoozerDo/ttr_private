import { RouteConfig, settingsRoute, sidebarRoutes } from "@/src/navigation/routes";

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

const navigationRoutes = [...sidebarRoutes, settingsRoute];

export const JOURNEY_NAV_STEPS: JourneyStep[] = navigationRoutes.map((route) => ({
  id: route.id,
  label: route.label,
}));

const DEFAULT_STEP_ID: JourneyStepId = JOURNEY_NAV_STEPS[0]?.id ?? ("dashboard" as JourneyStepId);

const PATHNAME_TO_STEP_MAP: Record<string, JourneyStepId> = navigationRoutes.reduce<
  Record<string, JourneyStepId>
>((acc, route) => {
  acc[route.href] = route.id;
  return acc;
}, {});

const normalizePathname = (pathname?: string) => {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
};

export function getStepIdForPathname(pathname?: string): JourneyStepId | null {
  const normalized = normalizePathname(pathname);
  if (!normalized) {
    return null;
  }

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
  unlockedStepIds?: JourneyStepId[];
  completedStepIds?: JourneyStepId[];
  activeStepId?: JourneyStepId;
};

export function resolveJourneyNavState(input: ResolveJourneyNavStateInput): JourneyNavState {
  const { unlockedStepIds = [], completedStepIds = [], activeStepId: explicitActiveStepId } = input;

  const unlockedSet = new Set(unlockedStepIds);
  const completedSet = new Set(completedStepIds);

  const candidateActive =
    (explicitActiveStepId && JOURNEY_NAV_STEPS.some((step) => step.id === explicitActiveStepId)
      ? explicitActiveStepId
      : getStepIdForPathname(input.currentPathname)) ?? DEFAULT_STEP_ID;

  const activeStepId = candidateActive ?? DEFAULT_STEP_ID;
  const activeIndex = JOURNEY_NAV_STEPS.findIndex((step) => step.id === activeStepId);

  const steps = JOURNEY_NAV_STEPS.map((step, index) => {
    let state: JourneyStepState = JourneyStepState.Locked;

    if (index === activeIndex) {
      state = JourneyStepState.Active;
    } else if (index < activeIndex) {
      state = completedSet.has(step.id)
        ? JourneyStepState.Completed
        : unlockedSet.has(step.id)
        ? JourneyStepState.Available
        : JourneyStepState.Locked;
    } else {
      state = unlockedSet.has(step.id) ? JourneyStepState.Available : JourneyStepState.Locked;
    }

    return {
      ...step,
      state,
    };
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
    unlockedStepIds: [activeStepId],
    completedStepIds: [],
  });
}
