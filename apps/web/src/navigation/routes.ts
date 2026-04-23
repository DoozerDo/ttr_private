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

export type FitReviewHrefInput = {
  baselineId?: string | null;
  jobId?: string | null;
  baselineVersionId?: string | null;
  assessmentId?: string | null;
  analysisId?: string | null;
  highlightClaim?: string | null;
  locked?: boolean | number | string | null;
};

export type ResultsHrefInput = {
  baselineId?: string | null;
  jobId?: string | null;
  assessmentId?: string | null;
  analysisId?: string | null;
  highlightClaim?: string | null;
};

export type StudioHrefInput = {
  baselineId?: string | null;
  jobId?: string | null;
  baselineVersionId?: string | null;
  assessmentId?: string | null;
  analysisId?: string | null;
  fromUnlock?: boolean;
  unlockDimension?: string | null;
  missingEvidence?: string[] | null;
};

function appendFitReviewParam(
  params: URLSearchParams,
  key: string,
  value?: string | null,
) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length > 0) {
    params.set(key, trimmed);
  }
}

function appendRouteParam(
  params: URLSearchParams,
  key: string,
  value?: string | null,
) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length > 0) {
    params.set(key, trimmed);
  }
}

export function getFitReviewHref(input: FitReviewHrefInput = {}) {
  const params = new URLSearchParams();
  appendFitReviewParam(params, "jobId", input.jobId ?? null);
  const hasAssessmentId = Boolean((input.assessmentId ?? "").trim());
  if (hasAssessmentId) {
    appendFitReviewParam(params, "analysisId", input.analysisId ?? input.assessmentId ?? null);
    appendFitReviewParam(params, "assessmentId", input.assessmentId ?? input.analysisId ?? null);
    appendFitReviewParam(params, "baselineId", input.baselineId ?? null);
    appendFitReviewParam(params, "baselineVersionId", input.baselineVersionId ?? null);
  } else {
    appendFitReviewParam(params, "baselineId", input.baselineId ?? null);
    appendFitReviewParam(params, "analysisId", input.analysisId ?? input.assessmentId ?? null);
    appendFitReviewParam(params, "baselineVersionId", input.baselineVersionId ?? null);
  }
  appendFitReviewParam(params, "highlightClaim", input.highlightClaim ?? null);

  if (input.locked) {
    params.set("locked", typeof input.locked === "boolean" ? "1" : String(input.locked));
  }

  const query = params.toString();
  return query ? `/fit-review?${query}` : "/fit-review";
}

export function getResultsHref(input: ResultsHrefInput = {}) {
  const params = new URLSearchParams();
  appendRouteParam(params, "jobId", input.jobId ?? null);
  appendRouteParam(params, "assessmentId", input.assessmentId ?? input.analysisId ?? null);
  appendRouteParam(params, "baselineId", input.baselineId ?? null);
  appendRouteParam(params, "highlightClaim", input.highlightClaim ?? null);

  const query = params.toString();
  return query ? `/results?${query}` : "/results";
}

export function getStudioHref(input: StudioHrefInput = {}) {
  const params = new URLSearchParams();
  appendRouteParam(params, "jobId", input.jobId ?? null);
  appendRouteParam(params, "analysisId", input.analysisId ?? input.assessmentId ?? null);
  appendRouteParam(params, "baselineId", input.baselineId ?? null);
  appendRouteParam(params, "baselineVersionId", input.baselineVersionId ?? null);

  if (input.fromUnlock) {
    params.set("fromUnlock", "true");
  }

  appendRouteParam(params, "unlockDimension", input.unlockDimension ?? null);
  if (Array.isArray(input.missingEvidence)) {
    input.missingEvidence
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean)
      .slice(0, 6)
      .forEach((value) => params.append("missingEvidence", value));
  }

  const query = params.toString();
  return query ? `/studio?${query}` : "/studio";
}

export type CanonicalRouteKind = "fit_review" | "results" | "studio";

export type CanonicalRouteGuardInput = {
  kind: CanonicalRouteKind;
  href: string;
  canonicalHref: string;
  state?: string | null;
  baselineId?: string | null;
  jobId?: string | null;
  entrySource?: string | null;
};

function normalizeRouteHref(href: string): string {
  const withoutHash = href.split("#")[0] ?? href;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
  return withoutQuery.endsWith("/") && withoutQuery !== "/"
    ? withoutQuery.slice(0, -1)
    : withoutQuery;
}

function shouldFailOnMismatch() {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_DECISION_FLOW === "true";
}

export function assertCanonicalRouteHref(input: CanonicalRouteGuardInput): string {
  const actualHref = input.href.trim();
  const canonicalHref = input.canonicalHref.trim();
  const legacyFallbackAttempted = normalizeRouteHref(actualHref) === "/resolve-gaps";
  const mismatch = actualHref !== canonicalHref;

  if (!legacyFallbackAttempted && !mismatch) {
    return actualHref;
  }

  const payload = {
    route: input.kind,
    state: input.state ?? null,
    baselineId: input.baselineId ?? null,
    jobId: input.jobId ?? null,
    entrySource: input.entrySource ?? null,
    resolvedRoute: actualHref,
    canonicalRoute: canonicalHref,
    legacyFallbackAttempted,
    legacyFallbackBlocked: true,
  };

  const message = `[canonical-route] non-canonical ${input.kind} href resolved`;
  if (shouldFailOnMismatch()) {
    console.error(message, payload);
    throw new Error(`${message}: ${actualHref} (expected ${canonicalHref})`);
  }

  console.error(message, payload);
  return canonicalHref;
}
