export type NextMoveAction = "generate" | "studio" | "improve" | "stop";

export type NextMove = {
  label: string;
  description: string;
  action: NextMoveAction;
  ctaText: string;
};

export function getNextMove(score: number): NextMove {
  if (score > 85) {
    return {
      label: "Generate",
      action: "generate",
      ctaText: "Generate Resume & Cover Letter",
      description: "You're a strong match. Move forward and generate tailored materials.",
    };
  }

  if (score >= 70) {
    return {
      label: "Open Studio",
      action: "studio",
      ctaText: "Open Studio",
      description: "You're competitive. Tighten positioning before applying.",
    };
  }

  if (score >= 50) {
    return {
      label: "Improve Fit",
      action: "improve",
      ctaText: "Start Fit Improvement",
      description: "You're close, but missing key signals. Improve fit before applying.",
    };
  }

  return {
    label: "Review Gaps",
    action: "stop",
    ctaText: "Review Gaps",
    description: "This role is not a fit right now. Focus on closing core gaps.",
  };
}

