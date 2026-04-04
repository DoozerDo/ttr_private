import { type NextActionType } from "@/lib/nextAction";
import { type StudioArtifactFailurePresentation } from "@/src/lib/studio/helpers";

export type StudioNextMoveAction = {
  label: string;
  action: () => void;
};

export type StudioNextMove = {
  title: string;
  description: string;
  primaryAction: StudioNextMoveAction;
  secondaryAction?: StudioNextMoveAction;
  context?: string;
};

export type StudioNextMoveInput = {
  analysisScore: number | null;
  canGenerateDocuments: boolean;
  studioGenerationState: "READY" | "LIMITED" | "BLOCKED";
  primaryNextAction: NextActionType;
  artifactFailure: StudioArtifactFailurePresentation | null;
  actions: {
    generateResume: () => void;
    generateCoverLetter: () => void;
    reviewTopGaps: () => void;
    improveExperience: () => void;
    analyzeAnotherRole: () => void;
    learnSupportedInputs: () => void;
    retryGeneration: () => void;
  };
};

function scoreContext(score: number | null): string {
  if (typeof score !== "number") return "Fit score unavailable.";
  return `Fit score ${Math.round(score)}.`;
}

function generationBlockedMove(input: StudioNextMoveInput): StudioNextMove {
  return {
    title: "Complete your profile before generating",
    description: "Generation is blocked until your structured experience is ready.",
    primaryAction: {
      label: "Continue Building Experience",
      action: input.actions.improveExperience,
    },
    context: scoreContext(input.analysisScore),
  };
}

function strongFitMove(input: StudioNextMoveInput): StudioNextMove {
  return {
    title: "You’re ready to generate grounded materials",
    description: "This role clears the threshold. Generate a resume and cover letter that stay grounded in verified experience.",
    primaryAction: {
      label: "Generate Resume",
      action: input.actions.generateResume,
    },
    secondaryAction: {
      label: "Generate Cover Letter",
      action: input.actions.generateCoverLetter,
    },
    context: scoreContext(input.analysisScore),
  };
}

function moderateFitMove(input: StudioNextMoveInput): StudioNextMove {
  return {
    title: "Close the gaps before you generate",
    description: "A few evidence gaps still limit output quality. Strengthen them before you produce final materials.",
    primaryAction: {
      label: "Review Top Gaps",
      action: input.actions.reviewTopGaps,
    },
    secondaryAction: {
      label: "Generate Anyway",
      action: input.actions.generateResume,
    },
    context: scoreContext(input.analysisScore),
  };
}

function lowFitMove(input: StudioNextMoveInput): StudioNextMove {
  return {
    title: "Build stronger evidence before this role",
    description: "The score is too low for useful output. Strengthen the baseline or analyze another role.",
    primaryAction: {
      label: "Improve Experience",
      action: input.actions.improveExperience,
    },
    secondaryAction: {
      label: "Analyze Another Role",
      action: input.actions.analyzeAnotherRole,
    },
    context: scoreContext(input.analysisScore),
  };
}

function unsupportedInputMove(input: StudioNextMoveInput, failure: StudioArtifactFailurePresentation): StudioNextMove {
  return {
    title: "This input won’t generate a reliable result",
    description: failure.explanation,
    primaryAction: {
      label: "Fix Input",
      action: input.actions.improveExperience,
    },
    secondaryAction: {
      label: "Learn What’s Supported",
      action: input.actions.learnSupportedInputs,
    },
    context: failure.detail ?? failure.userAction?.description ?? scoreContext(input.analysisScore),
  };
}

function traceFailureMove(input: StudioNextMoveInput, failure: StudioArtifactFailurePresentation): StudioNextMove {
  return {
    title: "We couldn’t verify this safely",
    description: failure.explanation,
    primaryAction: {
      label: "Improve Baseline Clarity",
      action: input.actions.improveExperience,
    },
    secondaryAction: {
      label: failure.retryable ? "Retry Generation" : "Adjust Input",
      action: input.actions.retryGeneration,
    },
    context: failure.detail ?? failure.userAction?.description ?? scoreContext(input.analysisScore),
  };
}

function blockedFailureMove(input: StudioNextMoveInput, failure: StudioArtifactFailurePresentation): StudioNextMove {
  return {
    title: "Complete your profile before generating",
    description: failure.explanation,
    primaryAction: {
      label: "Continue Building Experience",
      action: input.actions.improveExperience,
    },
    context: failure.detail ?? failure.userAction?.description ?? scoreContext(input.analysisScore),
  };
}

function validationOrGenericFailureMove(
  input: StudioNextMoveInput,
  failure: StudioArtifactFailurePresentation,
): StudioNextMove {
  return {
    title: "We couldn’t generate a reliable result",
    description: failure.explanation,
    primaryAction: {
      label: failure.retryable ? "Retry Generation" : "Adjust Input",
      action: failure.retryable ? input.actions.retryGeneration : input.actions.improveExperience,
    },
    secondaryAction: failure.retryable
      ? {
          label: "Adjust Input",
          action: input.actions.improveExperience,
        }
      : undefined,
    context: failure.detail ?? failure.userAction?.description ?? scoreContext(input.analysisScore),
  };
}

export function resolveStudioNextMove(input: StudioNextMoveInput): StudioNextMove {
  const failure = input.artifactFailure;
  if (failure) {
    switch (failure.category) {
      case "unsupported_input":
        return unsupportedInputMove(input, failure);
      case "trace_failure":
        return traceFailureMove(input, failure);
      case "generation_blocked":
        return blockedFailureMove(input, failure);
      case "validation_failure":
      case "generation_failed":
      default:
        return validationOrGenericFailureMove(input, failure);
    }
  }

  if (input.studioGenerationState === "BLOCKED") {
    return generationBlockedMove(input);
  }

  if (typeof input.analysisScore === "number" && input.analysisScore < 55) {
    return lowFitMove(input);
  }

  if (typeof input.analysisScore === "number" && input.analysisScore < 70) {
    return moderateFitMove(input);
  }

  if (input.canGenerateDocuments || input.primaryNextAction === "studio" || input.primaryNextAction === "studio_with_save") {
    return strongFitMove(input);
  }

  return generationBlockedMove(input);
}
