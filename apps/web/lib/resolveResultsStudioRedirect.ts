import { getResultsHref, getStudioHref } from "@/src/navigation/routes";
import { isWorkflowDirectStudioEligible, isWorkflowGenerationUnlocked } from "@shared/workflowThresholds";

export type ResultsStudioRedirectInput = {
  from: "results" | "studio";
  pathname: string;
  // Results-only: when Studio intentionally sends the user back to Results (ex: low-fit),
  // we lock the page to prevent Results from auto-routing back into Studio and creating a loop.
  locked?: boolean;
  baselineId: string | null;
  jobId: string | null;
  analysisId: string | null;
  baselineVersionId: string | null;
  score: number | null;
  hasAnyUsableOutput: boolean;
  generationReadinessBlocked: boolean;
};

export type ResultsStudioRedirectDecision = {
  redirectTo: string | null;
  reason: string | null;
  hasStablePairContext: boolean;
};

function normalizeId(value: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function stripQuery(href: string): string {
  const withoutHash = href.split("#")[0] ?? href;
  return withoutHash.split("?")[0] ?? withoutHash;
}

function buildResultsLockedHref(input: { baselineId: string; jobId: string; analysisId: string }): string {
  const base = getResultsHref({
    baselineId: input.baselineId,
    jobId: input.jobId,
    assessmentId: input.analysisId,
  });
  const [path, query = ""] = base.split("?");
  const params = new URLSearchParams(query);
  params.set("locked", "1");
  const nextQuery = params.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

export function resolveResultsStudioRedirect(
  input: ResultsStudioRedirectInput,
): ResultsStudioRedirectDecision {
  const baselineId = normalizeId(input.baselineId);
  const jobId = normalizeId(input.jobId);
  const analysisId = normalizeId(input.analysisId);
  const baselineVersionId = normalizeId(input.baselineVersionId);
  const pathname = (input.pathname ?? "").trim() || `/${input.from}`;

  const hasStablePairContext = Boolean(baselineId && jobId && analysisId);

  let redirectTo: string | null = null;
  let reason: string | null = null;

  if (!hasStablePairContext) {
    redirectTo = null;
    reason = "missing_pair_context";
  } else if (input.from === "results") {
    if (input.locked) {
      redirectTo = null;
      reason = "results_locked_no_auto_route";
    } else if (isWorkflowDirectStudioEligible(input.score)) {
      redirectTo = getStudioHref({
        baselineId,
        jobId,
        analysisId,
        baselineVersionId,
      });
      reason = "results_auto_route_score_gte_80";
    }
  } else {
    // Studio -> Results redirect is allowed only for true low-fit (below the unlock floor) gating,
    // and only when we have exact pair context (to prevent cross-page ping pong).
    if (typeof input.score === "number" && !isWorkflowGenerationUnlocked(input.score) && !input.hasAnyUsableOutput) {
      redirectTo = buildResultsLockedHref({ baselineId: baselineId!, jobId: jobId!, analysisId: analysisId! });
      reason = "studio_low_fit_redirect_score_lt_70";
    }
  }

  // Loop prevention: never navigate if the target normalizes back to the current route.
  if (redirectTo && stripQuery(redirectTo) === stripQuery(pathname)) {
    redirectTo = null;
    reason = "no_op_same_route";
  }

  if (process.env.NODE_ENV === "development") {
    console.debug("[resultsStudioRedirect]", {
      from: input.from,
      pathname,
      baselineId,
      jobId,
      analysisId,
      baselineVersionId,
      score: typeof input.score === "number" ? input.score : null,
      generationReadinessBlocked: input.generationReadinessBlocked,
      hasAnyUsableOutput: input.hasAnyUsableOutput,
      redirectTo,
      reason,
    });
  }

  return { redirectTo, reason, hasStablePairContext };
}
