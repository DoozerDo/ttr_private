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
    subtext: "Set your baseline",
  },
  {
    id: "results",
    label: "Results",
    href: "/results",
    requiresAuth: true,
    requiresBaseline: true,
    requiresJob: true,
    subtext: "See fit score, strengths, and risks",
  },
  {
    id: "studio",
    label: "Resume and Cover Letter Studio",
    href: "/studio",
    requiresAuth: true,
    requiresBaseline: true,
    requiresJob: true,
    subtext: "Generate and export your documents",
  },
  {
    id: "jobTracker",
    label: "Opportunities",
    href: "/job-tracker",
    requiresAuth: true,
    subtext: "Manage active roles in one place",
  },
  {
    id: "interviewToolkit",
    label: "Interview Toolkit",
    href: "/interview-toolkit",
    requiresAuth: true,
    requiresJob: true,
    subtext: "Prepare answers and stories",
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
