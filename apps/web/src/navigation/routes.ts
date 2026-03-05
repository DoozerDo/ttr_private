export type RouteConfig = {
  id: string;
  label: string;
  href: string;
  icon?: string;
  requiresAuth: boolean;
  requiresBaseline?: boolean;
  requiresJob?: boolean;
  featureFlag?: string;
  subtext?: string;
  showInSidebar?: boolean;
};

const sidebarNavRoutes: RouteConfig[] = [
  {
    id: "baselines",
    label: "TARGET",
    href: "/baseline",
    requiresAuth: true,
    subtext: "Upload a baseline to begin targeting a role",
  },
  {
    id: "results",
    label: "Results",
    href: "/results",
    requiresAuth: true,
    requiresBaseline: true,
    requiresJob: true,
    subtext: "Understand the verdict for this role",
  },
  {
    id: "studio",
    label: "Resume and Cover Letter Studio",
    href: "/studio",
    requiresAuth: true,
    requiresBaseline: true,
    requiresJob: true,
    subtext: "Draft and export your documents",
  },
  {
    id: "jobTracker",
    label: "Opportunities",
    href: "/opportunities",
    requiresAuth: true,
    subtext: "What roles am I pursuing?",
  },
  {
    id: "interviewToolkit",
    label: "Interview Toolkit",
    href: "/interview-toolkit",
    requiresAuth: true,
    requiresJob: true,
    subtext: "Interview scheduled. Now what?",
  },
];

const hiddenRoutes: RouteConfig[] = [
  {
    id: "coverLetters",
    label: "Cover Letter Studio",
    href: "/cover-letters",
    requiresAuth: true,
    requiresBaseline: true,
    requiresJob: true,
  },
];

const baseRoutes: RouteConfig[] = [...sidebarNavRoutes, ...hiddenRoutes];

const settingsRoute: RouteConfig = {
  id: "settings",
  label: "Settings",
  href: "/settings",
  requiresAuth: true,
  showInSidebar: false,
};

const allRoutes = [...baseRoutes, settingsRoute];

export const sidebarRoutes = sidebarNavRoutes;

export const routeLookup = new Map(allRoutes.map((route) => [route.id, route]));

export function getRouteById(id: string) {
  return routeLookup.get(id) ?? null;
}

export { settingsRoute };

export function getJobDetailsHref(jobId: string) {
  return `/jobs/${encodeURIComponent(jobId)}`;
}

export function getBaselineDetailsHref(baselineId: string) {
  return `/baseline/${encodeURIComponent(baselineId)}`;
}
