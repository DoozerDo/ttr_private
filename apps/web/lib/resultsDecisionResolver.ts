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
  const { score, generationReadiness } = input;
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

  if (score >= 80) {
    return {
      state: generationReadiness.confidence === "HIGH" ? "READY" : "DRAFT",
      primaryCta: "OPEN_STUDIO",
      headline: "You're a strong match. You can generate now.",
      subtext:
        generationReadiness.confidence === "HIGH"
          ? "Your results are backed by verified evidence."
          : "Some claims are unverified. You can strengthen your output in Studio.",
    };
  }

  if (generationReadiness.state === "BLOCKED") {
    return {
      state: "BLOCKED",
      primaryCta: "START_FIT_REVIEW",
      headline: `${fitLabel}. Not ready to generate yet.`,
      subtext:
        "Your experience aligns with this role, but key claims still need verified evidence before Studio can generate safely.",
    };
  }

  if (generationReadiness.state === "ALLOWED") {
    return {
      state: "READY",
      primaryCta: "OPEN_STUDIO",
      headline: `${fitLabel}. Studio is ready.`,
      subtext:
        generationReadiness.confidence === "HIGH"
          ? "Your verified evidence is complete enough to generate safely in Studio."
          : "Studio can open now while you strengthen evidence for better output quality.",
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
