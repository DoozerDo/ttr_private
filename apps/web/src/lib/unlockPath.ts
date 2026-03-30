export type UnlockPathModuleState = "LOCKED" | "CURRENT" | "UNLOCKED" | "COMPLETE";

export type UnlockPathResolvedState = {
  baseline: UnlockPathModuleState;
  analysis: UnlockPathModuleState;
  fitReview: UnlockPathModuleState;
  studio: UnlockPathModuleState;
  opportunities: "LOCKED" | "UNLOCKED" | "CURRENT";
};

export type UnlockPathInput = {
  currentPathname?: string;
  baselineReady: boolean;
  analysisExists: boolean;
  score: number | null;
  readinessStatus?: "ready" | "limited" | "blocked" | null;
  hasGeneratedDocuments: boolean;
  hasSavedOpportunity?: boolean;
};

export type UnlockPathModuleKey = "baseline" | "analysis" | "fitReview" | "studio" | "opportunities";

function matchesPath(pathname: string | undefined, prefix: string): boolean {
  if (!pathname) return false;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolveUnlockPathState(input: UnlockPathInput): UnlockPathResolvedState {
  const isBaselineRoute = matchesPath(input.currentPathname, "/baseline");
  const isAnalyzeRoute = matchesPath(input.currentPathname, "/analyze");
  const isFitReviewRoute = matchesPath(input.currentPathname, "/fit-review");
  const isStudioRoute = matchesPath(input.currentPathname, "/studio");
  const isOpportunitiesRoute = matchesPath(input.currentPathname, "/opportunities") ||
    matchesPath(input.currentPathname, "/job-tracker");

  const score = typeof input.score === "number" ? input.score : null;
  const readinessReady = input.readinessStatus === "ready";
  const studioEligible = score !== null && score >= 70 && readinessReady;
  const fitReviewCurrent = score !== null && score >= 70 && !readinessReady;

  const baseline: UnlockPathModuleState =
    isBaselineRoute ? "CURRENT" : input.baselineReady ? "COMPLETE" : "CURRENT";

  const analysis: UnlockPathModuleState =
    !input.baselineReady
      ? "LOCKED"
      : isAnalyzeRoute
        ? "CURRENT"
        : input.analysisExists
          ? "COMPLETE"
          : "UNLOCKED";

  const fitReview: UnlockPathModuleState = fitReviewCurrent ? "CURRENT" : "COMPLETE";

  const studio: UnlockPathModuleState =
    !studioEligible
      ? "LOCKED"
      : isStudioRoute
        ? "CURRENT"
        : input.hasGeneratedDocuments
          ? "COMPLETE"
          : "UNLOCKED";

  const opportunities: "LOCKED" | "UNLOCKED" | "CURRENT" =
    !studioEligible
      ? "LOCKED"
      : isOpportunitiesRoute
        ? "CURRENT"
        : input.hasSavedOpportunity
          ? "UNLOCKED"
          : "UNLOCKED";

  return {
    baseline,
    analysis,
    fitReview,
    studio,
    opportunities,
  };
}
