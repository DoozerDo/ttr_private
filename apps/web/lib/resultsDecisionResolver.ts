import { resolveCanonicalState } from "@/lib/canonicalDecision";
import { buildResultsDecisionCopy } from "@/lib/resultsMessaging";
import type {
  GenerationProductConfidence,
  GenerationProductReadinessState,
} from "@/lib/generationProductReadiness";

export type ResultsDecisionState = "BLOCKED" | "READY" | "IMPROVE" | "DRAFT";

export interface ResultsDecisionInput {
  score: number | null;
  generationReadiness: {
    state: GenerationProductReadinessState;
    confidence: GenerationProductConfidence;
    needsVerification: boolean;
  };
}

export interface ResultsDecision {
  state: ResultsDecisionState;
  primaryCta: "START_FIT_REVIEW" | "OPEN_STUDIO";
  headline: string;
  subtext: string;
}

export function resolveResultsDecision(input: ResultsDecisionInput): ResultsDecision {
  const score = typeof input.score === "number" && Number.isFinite(input.score) ? input.score : null;
  const scoreFloorBlocked = score !== null && score < 80;
  const generationAllowed = score !== null && score >= 80;
  const canonical = resolveCanonicalState({
    surface: "results",
    baselineId: null,
    jobId: null,
    score,
    generationReadiness: {
      status: generationAllowed ? "ready" : "blocked",
      blocked: !generationAllowed,
      reasonCodes:
        input.generationReadiness.needsVerification || scoreFloorBlocked ? ["needs_verification"] : [],
      reasons:
        input.generationReadiness.needsVerification || scoreFloorBlocked
        ? [{ code: "full_block", message: "verification required" }]
        : [],
      badgeLabel: generationAllowed ? "READY" : "BLOCKED",
      summary: generationAllowed
        ? "Generation ready"
        : "Generation blocked",
      verificationIssues: [],
    },
    productReadiness: {
      generation_readiness: {
        canGenerate: generationAllowed,
        canExport: generationAllowed,
        reasonsBlocked: generationAllowed ? [] : ["generation_blocked"],
      },
      state: generationAllowed ? "ALLOWED" : "BLOCKED",
      confidence:
        generationAllowed && score !== null && score >= 90
          ? "HIGH"
          : generationAllowed && input.generationReadiness.confidence === "HIGH"
            ? "HIGH"
            : generationAllowed
              ? "MEDIUM"
              : input.generationReadiness.confidence,
      needsVerification: generationAllowed ? score !== null && score < 90 : input.generationReadiness.needsVerification,
      tier: generationAllowed ? "generation_allowed" : "fit_review_only",
      canOpenStudio: generationAllowed,
      generationMode:
        generationAllowed && score !== null && score >= 90
          ? "verified"
          : input.generationReadiness.confidence === "HIGH"
            ? "verified"
            : "draft",
    },
    studioHref: "/studio",
    fitReviewHref: "/fit-review",
    scoreCandidates: [{ source: "primary", value: score }],
  });

  if (canonical.readinessState === "READY") {
    const copy = buildResultsDecisionCopy({
      score,
      generationReadiness: {
        state: "ALLOWED",
        confidence: input.generationReadiness.confidence,
        needsVerification: input.generationReadiness.needsVerification,
      },
    });
    return {
      state: "READY",
      primaryCta: "OPEN_STUDIO",
      headline: copy.headline,
      subtext: copy.subtext,
    };
  }

  if (canonical.readinessState === "DRAFT") {
    const copy = buildResultsDecisionCopy({
      score,
      generationReadiness: {
        state: "ALLOWED",
        confidence:
          score !== null && score >= 90
            ? "HIGH"
            : input.generationReadiness.confidence === "HIGH"
              ? "HIGH"
              : "MEDIUM",
        needsVerification: score !== null ? score < 90 : true,
      },
    });
    return {
      state: "DRAFT",
      primaryCta: "OPEN_STUDIO",
      headline: copy.headline,
      subtext: copy.subtext,
    };
  }

  if (canonical.readinessState === "BLOCKED") {
    const copy = buildResultsDecisionCopy({
      score,
      generationReadiness: {
        state: "BLOCKED",
        confidence: input.generationReadiness.confidence,
        needsVerification: input.generationReadiness.needsVerification,
      },
    });
    return {
      state: "BLOCKED",
      primaryCta: "START_FIT_REVIEW",
      headline: copy.headline,
      subtext: copy.subtext,
    };
  }

  return {
    state: "IMPROVE",
    primaryCta: "START_FIT_REVIEW",
    headline: "Strengthen your fit before generating.",
    subtext:
      "You are close, but improving alignment and evidence will significantly strengthen your materials.",
  };
}
