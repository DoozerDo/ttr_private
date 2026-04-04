import type { GenerationAuthorityState } from "@/lib/generationAuthority";

export type GenerationReadinessContract = {
  canGenerate: boolean;
  canExport: boolean;
  reasonsBlocked: string[];
};

export type GenerationProductTier =
  | "fit_review_only"
  | "studio_unlocked"
  | "generation_allowed"
  | "generation_export_allowed";

export type GenerationProductReadiness = {
  generation_readiness: GenerationReadinessContract;
  tier: GenerationProductTier;
  canOpenStudio: boolean;
};

type BuildGenerationProductReadinessInput = {
  score: number | null;
  authorityState: GenerationAuthorityState;
  hasCanonicalAssessment: boolean;
  hasRequiredContext: boolean;
  isPro: boolean;
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
  const scoreEligibleForStudio = score !== null && score >= 70;

  if (!scoreEligibleForStudio) {
    reasonsBlocked.push("score_below_unlock_floor");
  }

  const canOpenStudio =
    scoreEligibleForStudio &&
    input.authorityState === "READY" &&
    input.hasCanonicalAssessment &&
    input.hasRequiredContext;
  const canGenerate =
    scoreEligibleForStudio &&
    input.authorityState === "READY" &&
    input.hasCanonicalAssessment &&
    input.hasRequiredContext;
  const canExport = canGenerate && input.isPro;

  if (!input.isPro) {
    reasonsBlocked.push("pro_required_for_export");
  }

  const uniqueReasonsBlocked = Array.from(new Set(reasonsBlocked));
  const tier: GenerationProductTier =
    !scoreEligibleForStudio
      ? "fit_review_only"
      : !canGenerate
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
    tier,
    canOpenStudio,
  };
}
