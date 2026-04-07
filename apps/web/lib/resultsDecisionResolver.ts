export type ResultsDecisionState = "BLOCKED" | "READY" | "IMPROVE" | "DRAFT";

export interface ResultsDecisionInput {
  score: number | null;
  generationReadinessStatus: "ready" | "limited" | "blocked";
}

export interface ResultsDecision {
  state: ResultsDecisionState;
  primaryCta: "START_FIT_REVIEW" | "OPEN_STUDIO";
  headline: string;
  subtext: string;
}

export function resolveResultsDecision(input: ResultsDecisionInput): ResultsDecision {
  const { score, generationReadinessStatus } = input;
  const fitLabel =
    typeof score === "number" && score >= 80
      ? "Strong fit"
      : typeof score === "number" && score >= 70
        ? "Competitive fit"
        : "This role needs more work";

  if (typeof score !== "number" || Number.isNaN(score)) {
    return {
      state: "IMPROVE",
      primaryCta: "START_FIT_REVIEW",
      headline: "Strengthen your fit before generating.",
      subtext:
        "Review the baseline signals first so Studio only uses evidence that is clear and verified.",
    };
  }

  if (score < 70) {
    return {
      state: "IMPROVE",
      primaryCta: "START_FIT_REVIEW",
      headline: "Strengthen your fit before generating.",
      subtext:
        "You are close, but improving alignment will make the next generation step safer and more useful.",
    };
  }

  if (generationReadinessStatus === "blocked") {
    return {
      state: "BLOCKED",
      primaryCta: "START_FIT_REVIEW",
      headline: `${fitLabel}. Not ready to generate yet.`,
      subtext:
        "Your experience aligns with this role, but key claims still need verified evidence before Studio can generate safely.",
    };
  }

  if (generationReadinessStatus === "limited") {
    return {
      state: "DRAFT",
      primaryCta: "OPEN_STUDIO",
      headline: `${fitLabel}. Studio is available, but evidence is still thin.`,
      subtext:
        "Studio can open in draft mode now, and stronger verification will improve confidence and output quality.",
    };
  }

  if (score >= 70) {
    return {
      state: "READY",
      primaryCta: "OPEN_STUDIO",
      headline: `${fitLabel}. Studio is ready.`,
      subtext:
        "Your verified evidence is complete enough to generate safely in Studio.",
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
