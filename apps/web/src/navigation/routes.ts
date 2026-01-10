export type RouteConfig = {
  id: string;
  label: string;
  href: string;
  icon?: string;
  requiresAuth: boolean;
  requiresBaseline?: boolean;
  requiresJob?: boolean;
  featureFlag?: string;
  showInSidebar?: boolean;
};

const baseRoutes: RouteConfig[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/",
    requiresAuth: true,
  },
  {
    id: "analyze",
    label: "Analyze",
    href: "/analyze",
    requiresAuth: true,
    requiresBaseline: true,
  },
  {
    id: "baselines",
    label: "Baselines",
    href: "/baseline",
    requiresAuth: true,
  },
  {
    id: "resume",
    label: "Resume Studio",
    href: "/results",
    requiresAuth: true,
    requiresBaseline: true,
    requiresJob: true,
  },
  {
    id: "coverLetters",
    label: "Cover Letter Studio",
    href: "/cover-letters",
    requiresAuth: true,
    requiresBaseline: true,
    requiresJob: true,
  },
  {
    id: "interviewToolkit",
    label: "Interview Toolkit",
    href: "/interview-toolkit",
    requiresAuth: true,
    requiresJob: true,
  },
  {
    id: "searchSets",
    label: "Search Sets",
    href: "/search-sets",
    requiresAuth: true,
    requiresBaseline: true,
  },
  {
    id: "jobTracker",
    label: "Job Tracker",
    href: "/applications",
    requiresAuth: true,
  },
];

const settingsRoute: RouteConfig = {
  id: "settings",
  label: "Account Settings",
  href: "/settings",
  requiresAuth: true,
  showInSidebar: false,
};

const allRoutes = [...baseRoutes, settingsRoute];

export const sidebarRoutes = baseRoutes;

export const routeLookup = new Map(allRoutes.map((route) => [route.id, route]));

export function getRouteById(id: string) {
  return routeLookup.get(id) ?? null;
}

export { settingsRoute };
