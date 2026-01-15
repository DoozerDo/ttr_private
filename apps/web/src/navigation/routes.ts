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
    label: "Baseline Library",
    href: "/baseline",
    requiresAuth: true,
    subtext: "Upload a baseline to begin targeting a role",
  },
  {
    id: "jobs",
    label: "Job Description Library",
    href: "/jobs",
    requiresAuth: true,
    subtext: "Upload a job description you wish to target",
  },
  {
    id: "analyze",
    label: "Analyze",
    href: "/analyze",
    requiresAuth: true,
    requiresBaseline: true,
    subtext: "Calculate your Compatibility Score",
  },
  {
    id: "resume",
    label: "Resume and Cover Letter Studio",
    href: "/results",
    requiresAuth: true,
    requiresBaseline: true,
    requiresJob: true,
    subtext: "Generate tailored documents",
  },
  {
    id: "searchSets",
    label: "Search Sets",
    href: "/search-sets",
    requiresAuth: true,
    requiresBaseline: true,
    subtext: "Find your next role",
  },
  {
    id: "jobTracker",
    label: "Job Tracker",
    href: "/applications",
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
