import type { GenerationAuthorityState } from "@/lib/generationAuthority";

export type GenerationReadinessContract = {
  canGenerate: boolean;
  canExport: boolean;
  reasonsBlocked: string[];
};

export type GenerationProductReadinessState = "ALLOWED" | "BLOCKED";
export type GenerationProductConfidence = "HIGH" | "MEDIUM" | "LOW";

export type GenerationProductTier =
  | "fit_review_only"
  | "studio_unlocked"
  | "generation_allowed"
  | "generation_export_allowed";

export type GenerationProductReadiness = {
  generation_readiness: GenerationReadinessContract;
  state: GenerationProductReadinessState;
  confidence: GenerationProductConfidence;
  needsVerification: boolean;
  tier: GenerationProductTier;
  canOpenStudio: boolean;
  generationMode: "draft" | "verified";
};

type BuildGenerationProductReadinessInput = {
  score: number | null;
  authorityState: GenerationAuthorityState;
  hasCanonicalAssessment: boolean;
  hasRequiredContext: boolean;
  isPro: boolean;
  hasCompletedGeneration?: boolean;
};

export function buildGenerationProductReadiness(
  input: BuildGenerationProductReadinessInput,
): GenerationProductReadiness {
  const reasonsBlocked: string[] = [];

  if (typeof input.score !== "number") {
    reasonsBlocked.push("missing_score");
  }
  if (!input.hasCanonicalAssessment) {
    reasonsBlocked.push("missing_canonical_assessment");
  }
  if (!input.hasRequiredContext) {
    reasonsBlocked.push("missing_required_context");
  }
  if (input.authorityState !== "READY") {
    reasonsBlocked.push("readiness_not_ready");
  }

  const score = typeof input.score === "number" ? input.score : null;
  const scoreEligibleForGeneration = score !== null && score >= 80;
  const scoreEligibleForStudio = score !== null && score >= 70;

  if (!scoreEligibleForStudio) {
    reasonsBlocked.push("score_below_unlock_floor");
  }

  const legacyCanGenerate =
    scoreEligibleForStudio &&
    input.hasCanonicalAssessment &&
    (input.hasRequiredContext || !input.hasCompletedGeneration) &&
    input.authorityState === "READY";

  const state: GenerationProductReadinessState = scoreEligibleForGeneration
    ? "ALLOWED"
    : legacyCanGenerate
      ? "ALLOWED"
      : "BLOCKED";
  const confidence: GenerationProductConfidence =
    scoreEligibleForGeneration && input.authorityState !== "READY"
      ? "MEDIUM"
      : state === "ALLOWED"
        ? "HIGH"
        : "LOW";
  const needsVerification = state === "ALLOWED" ? confidence !== "HIGH" : true;
  const canOpenStudio = state === "ALLOWED";
  const canGenerate = state === "ALLOWED";
  const canExport = canGenerate && input.isPro;

  if (!input.isPro) {
    reasonsBlocked.push("pro_required_for_export");
  }

  const uniqueReasonsBlocked = Array.from(new Set(reasonsBlocked));
  const tier: GenerationProductTier =
    state === "BLOCKED" && !scoreEligibleForStudio
      ? "fit_review_only"
      : state === "BLOCKED"
      ? "studio_unlocked"
      : canExport
      ? "generation_export_allowed"
      : "generation_allowed";

  return {
    generation_readiness: {
      canGenerate,
      canExport,
      reasonsBlocked: uniqueReasonsBlocked,
    },
    state,
    confidence,
    needsVerification,
    tier,
    canOpenStudio,
    generationMode: confidence === "HIGH" ? "verified" : "draft",
  };
}
