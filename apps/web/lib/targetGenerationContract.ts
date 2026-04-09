import type { GenerationReadiness } from "@/lib/generationReadiness";
import type { GenerationProductReadiness } from "@/lib/generationProductReadiness";

export type TargetCtaState = "READY" | "LIMITED" | "BLOCKED";

export type TargetCtaActionType =
  | "open_studio_generate"
  | "open_studio_limited"
  | "blocked_redirect"
  | "resolve_gaps";

export type TargetCtaSource = "fresh_computation" | "persisted_latest_assessment" | "fallback_default";
export type TargetAnalysisSource = "fresh_computation" | "persisted_latest_assessment" | "fallback_default";

export type TargetCtaContract = {
  state: TargetCtaState;
  label: string;
  href: string;
  actionType: TargetCtaActionType;
  score: number | null;
  scoreSource: TargetCtaSource;
  readinessSource: "score_floor" | "generation_ready" | "generation_limited" | "generation_blocked";
  isStudioDestination: boolean;
};

export type TargetResultLike = {
  baselineId?: string | null;
  jobId?: string | null;
  [key: string]: unknown;
};

type BuildTargetCtaContractInput = {
  score: number | null;
  generationReadiness: GenerationReadiness;
  productReadiness: GenerationProductReadiness;
  studioHref: string;
  resolveGapsHref: string;
  scoreSource: TargetCtaSource;
};

type ResolveTargetDisplayResultInput = {
  currentResult: TargetResultLike | null;
  persistedResult: TargetResultLike | null;
  baselineId: string | null;
  jobId: string | null;
};

export type ResolvedTargetDisplayResult = {
  result: TargetResultLike | null;
  source: TargetAnalysisSource;
};

function matchesActivePair(
  candidate: TargetResultLike | null,
  baselineId: string | null,
  jobId: string | null,
): boolean {
  if (!candidate || !baselineId || !jobId) return false;
  return candidate.baselineId?.trim() === baselineId.trim() && candidate.jobId?.trim() === jobId.trim();
}

export function resolveTargetDisplayResult(
  input: ResolveTargetDisplayResultInput,
): ResolvedTargetDisplayResult {
  if (matchesActivePair(input.currentResult, input.baselineId, input.jobId)) {
    return {
      result: input.currentResult,
      source: "fresh_computation",
    };
  }

  if (matchesActivePair(input.persistedResult, input.baselineId, input.jobId)) {
    return {
      result: input.persistedResult,
      source: "persisted_latest_assessment",
    };
  }

  return {
    result: null,
    source: "fallback_default",
  };
}

export function buildTargetCtaContract(input: BuildTargetCtaContractInput): TargetCtaContract {
  const score = typeof input.score === "number" && Number.isFinite(input.score) ? input.score : null;

  if (score === null) {
    return {
      state: "BLOCKED",
      label: "Generate Compatibility Score",
      href: input.resolveGapsHref,
      actionType: "resolve_gaps",
      score,
      scoreSource: input.scoreSource,
      readinessSource: "score_floor",
      isStudioDestination: false,
    };
  }

  if (score < 70) {
    return {
      state: "BLOCKED",
      label: "Start Fit Review",
      href: input.resolveGapsHref,
      actionType: "resolve_gaps",
      score,
      scoreSource: input.scoreSource,
      readinessSource: "score_floor",
      isStudioDestination: false,
    };
  }

  if (input.generationReadiness.status === "ready" && input.productReadiness.canOpenStudio) {
    return {
      state: "READY",
      label: "Open Studio",
      href: input.studioHref,
      actionType: "open_studio_generate",
      score,
      scoreSource: input.scoreSource,
      readinessSource: "generation_ready",
      isStudioDestination: true,
    };
  }

  if (input.generationReadiness.status === "limited") {
    return {
      state: "LIMITED",
      label: "Start Fit Review",
      href: input.resolveGapsHref,
      actionType: "resolve_gaps",
      score,
      scoreSource: input.scoreSource,
      readinessSource: "generation_limited",
      isStudioDestination: false,
    };
  }

  return {
    state: "BLOCKED",
    label: "Start Fit Review",
    href: input.resolveGapsHref,
    actionType: "resolve_gaps",
    score,
    scoreSource: input.scoreSource,
    readinessSource: "generation_blocked",
    isStudioDestination: false,
  };
}
