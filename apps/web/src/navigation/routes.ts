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
  comingSoon?: boolean;
};

const sidebarNavRoutes: RouteConfig[] = [
  {
    id: "baselines",
    label: "BASELINE STUDIO",
    href: "/baseline",
    requiresAuth: true,
    subtext: "Strengthen your profile before targeting roles",
  },
  {
    id: "target",
    label: "TARGET",
    href: "/target",
    requiresAuth: true,
    requiresBaseline: true,
    requiresJob: true,
    subtext: "Select role targets for scoring",
  },
  {
    id: "results",
    label: "SCORE",
    href: "/results",
    requiresAuth: true,
    requiresBaseline: true,
    requiresJob: true,
    subtext: "See fit score, strengths, and risks",
  },
  {
    id: "studio",
    label: "DOCUMENT GENERATOR",
    href: "/studio",
    requiresAuth: true,
    requiresBaseline: true,
    requiresJob: true,
    subtext: "Generate and export your documents",
  },
  {
    id: "jobTracker",
    label: "OPPORTUNITIES",
    href: "/job-tracker",
    requiresAuth: true,
    subtext: "Manage active roles in one place",
  },
  {
    id: "interviewToolkit",
    label: "Interview Toolkit · Coming Soon",
    href: "/interview-toolkit",
    requiresAuth: true,
    requiresJob: true,
    subtext: "Prepare answers and stories",
    comingSoon: true,
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
