export type ResultsDecisionState = "BLOCKED" | "READY" | "IMPROVE";

export interface ResultsDecisionInput {
  score: number | null;
  generationBlocked: boolean;
  hasVerifiedEvidence: boolean;
  hasGaps: boolean;
}

export interface ResultsDecision {
  state: ResultsDecisionState;
  primaryCta: "START_FIT_REVIEW" | "OPEN_STUDIO";
  headline: string;
  subtext: string;
}

export function resolveResultsDecision(input: ResultsDecisionInput): ResultsDecision {
  const { score, generationBlocked, hasVerifiedEvidence, hasGaps } = input;

  if (generationBlocked || !hasVerifiedEvidence) {
    return {
      state: "BLOCKED",
      primaryCta: "START_FIT_REVIEW",
      headline: "You need verified evidence to proceed.",
      subtext:
        "Your fit may be strong, but key claims are not yet supported by verified evidence. Complete Fit Review to unlock generation.",
    };
  }

  if (score !== null && score >= 80 && !hasGaps) {
    return {
      state: "READY",
      primaryCta: "OPEN_STUDIO",
      headline: "You are ready to generate materials.",
      subtext:
        "Your baseline is sufficiently aligned and supported. You can proceed to Studio to generate tailored outputs.",
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
