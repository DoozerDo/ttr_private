import type { GenerationAuthorityState } from "@/lib/generationAuthority";
import { isDocumentGenerationUnlocked } from "@/lib/documentGenerationGate";
import { resolveDocumentGenerationMode } from "@/lib/documentGenerationContract";

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

  const score = typeof input.score === "number" ? input.score : null;
  const scoreEligibleForGeneration = isDocumentGenerationUnlocked(score);

  if (!scoreEligibleForGeneration) {
    reasonsBlocked.push("score_below_unlock_floor");
  }

  const state: GenerationProductReadinessState =
    scoreEligibleForGeneration && input.hasCanonicalAssessment && input.hasRequiredContext
      ? "ALLOWED"
      : "BLOCKED";
  const confidence: GenerationProductConfidence =
    state === "ALLOWED"
      ? score !== null && score >= 90
        ? "HIGH"
        : input.authorityState === "READY"
          ? "HIGH"
          : "MEDIUM"
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
    state === "BLOCKED" && !scoreEligibleForGeneration
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
    generationMode: resolveDocumentGenerationMode(score) === "finalized" ? "verified" : "draft",
  };
}
