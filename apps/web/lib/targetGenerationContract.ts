import {
  resolveCanonicalState,
  resolveTargetDisplayResult as resolveCanonicalTargetDisplayResult,
} from "@/lib/canonicalDecision";
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

export type TargetCtaClickedAnalyticsPayload = {
  state: TargetCtaState;
  score: number | null;
  label: string;
  href: string;
  actionType: TargetCtaActionType;
};

export type TargetResultLike = {
  baselineId?: string | null;
  jobId?: string | null;
  [key: string]: unknown;
};

type BuildTargetCtaContractInput = {
  baselineId: string | null;
  jobId: string | null;
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

function shouldFailOnMismatch() {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_DECISION_FLOW === "true";
}

function serializeTargetValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function assertTargetCtaAnalyticsMatchesRenderedCta(
  contract: TargetCtaContract,
  payload: TargetCtaClickedAnalyticsPayload,
) {
  const mismatches = [
    ["state", contract.state, payload.state],
    ["score", contract.score, payload.score],
    ["label", contract.label, payload.label],
    ["href", contract.href, payload.href],
    ["actionType", contract.actionType, payload.actionType],
  ].filter(([, rendered, emitted]) => !Object.is(rendered, emitted));

  if (!mismatches.length) return;

  const message =
    "[target-cta] analytics payload mismatch: " +
    mismatches
      .map(([key, rendered, emitted]) => `${key} rendered=${serializeTargetValue(rendered)} emitted=${serializeTargetValue(emitted)}`)
      .join(", ");

  if (shouldFailOnMismatch()) {
    console.error(message, { rendered: contract, emitted: payload });
    throw new Error(message);
  }
  console.error(message, { rendered: contract, emitted: payload });
}

export function resolveTargetDisplayResult(
  input: ResolveTargetDisplayResultInput,
): ResolvedTargetDisplayResult {
  const resolved = resolveCanonicalTargetDisplayResult({
    currentResult: input.currentResult,
    persistedResult: input.persistedResult,
    baselineId: input.baselineId,
    jobId: input.jobId,
  });

  return {
    result: resolved.result,
    source:
      resolved.source === "fresh"
        ? "fresh_computation"
        : resolved.source === "persisted"
          ? "persisted_latest_assessment"
          : "fallback_default",
  };
}

export function buildTargetCtaContract(input: BuildTargetCtaContractInput): TargetCtaContract {
  const canonical = resolveCanonicalState({
    surface: "target",
    baselineId: input.baselineId,
    jobId: input.jobId,
    score: input.score,
    generationReadiness: input.generationReadiness,
    productReadiness: input.productReadiness,
    studioHref: input.studioHref,
    resolveGapsHref: input.resolveGapsHref,
    scoreCandidates: [{ source: input.scoreSource, value: input.score }],
  });

  return {
    state: canonical.readinessState as TargetCtaState,
    label: canonical.cta.label,
    href: canonical.cta.href,
    actionType: canonical.cta.actionType as TargetCtaActionType,
    score: canonical.score,
    scoreSource: input.scoreSource,
    readinessSource:
      canonical.readinessSource === "generation_ready" ||
      canonical.readinessSource === "generation_limited" ||
      canonical.readinessSource === "generation_blocked"
        ? canonical.readinessSource
        : "score_floor",
    isStudioDestination: canonical.cta.actionType === "open_studio_generate",
  };
}

export function buildTargetCtaClickedAnalyticsPayload(
  contract: TargetCtaContract,
): TargetCtaClickedAnalyticsPayload {
  const payload = {
    state: contract.state,
    score: contract.score,
    label: contract.label,
    href: contract.href,
    actionType: contract.actionType,
  };
  assertTargetCtaAnalyticsMatchesRenderedCta(contract, payload);
  return payload;
}
