import { resolveCanonicalState } from "@/lib/canonicalDecision";
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
  const scoreFloorBlocked = score !== null && score < 70;
  const generationAllowed = input.generationReadiness.state === "ALLOWED" && !scoreFloorBlocked;
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
      confidence: input.generationReadiness.confidence,
      needsVerification: input.generationReadiness.needsVerification,
      tier: generationAllowed ? "generation_allowed" : "fit_review_only",
      canOpenStudio: generationAllowed,
      generationMode: input.generationReadiness.confidence === "HIGH" ? "verified" : "draft",
    },
    studioHref: "/studio",
    fitReviewHref: "/fit-review",
    scoreCandidates: [{ source: "primary", value: score }],
  });

  if (canonical.readinessState === "READY") {
    return {
      state: "READY",
      primaryCta: "OPEN_STUDIO",
      headline: "You're a strong match. You can generate now.",
      subtext:
        "Your verified evidence is complete enough to generate safely in Studio.",
    };
  }

  if (canonical.readinessState === "DRAFT") {
    return {
      state: "DRAFT",
      primaryCta: "OPEN_STUDIO",
      headline: "You're a strong match. You can generate now.",
      subtext:
        "Some claims are unverified. You can strengthen your output in Studio.",
    };
  }

  if (canonical.readinessState === "BLOCKED") {
    return {
      state: "BLOCKED",
      primaryCta: "START_FIT_REVIEW",
      headline: "Competitive fit. Not ready to generate yet.",
      subtext:
        "Your experience aligns with this role, but key claims still need verified evidence before Studio can generate safely.",
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
