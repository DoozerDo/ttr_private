export type ResultsDecisionState = "BLOCKED" | "READY" | "IMPROVE" | "DRAFT";

export interface ResultsDecisionInput {
  score: number | null;
  generationBlocked: boolean;
  hasVerifiedEvidence: boolean;
  hasGaps: boolean;
  hasGeneratedBefore?: boolean;
}

export interface ResultsDecision {
  state: ResultsDecisionState;
  primaryCta: "START_FIT_REVIEW" | "OPEN_STUDIO";
  headline: string;
  subtext: string;
}

export function resolveResultsDecision(input: ResultsDecisionInput): ResultsDecision {
  const { score, generationBlocked, hasVerifiedEvidence, hasGaps, hasGeneratedBefore } = input;

  if (!hasGeneratedBefore && (generationBlocked || hasGaps || !hasVerifiedEvidence)) {
    return {
      state: "DRAFT",
      primaryCta: "OPEN_STUDIO",
      headline: "You're close. Add 1-2 verified examples to unlock stronger results.",
      subtext:
        "Your first run can open Studio as a draft, so you can see value now and strengthen evidence after.",
    };
  }

  if (generationBlocked || !hasVerifiedEvidence) {
    return {
      state: "BLOCKED",
      primaryCta: "START_FIT_REVIEW",
      headline: "You need verified evidence to proceed.",
      subtext:
        "Your fit may be strong, but key claims are not yet supported by verified evidence. Complete Fit Review to unlock stronger generation.",
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
