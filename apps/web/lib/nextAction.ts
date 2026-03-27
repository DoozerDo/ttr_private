export type NextActionType =
  | "RESOLVE_GAPS"
  | "REANALYZE"
  | "GENERATE_RESUME"
  | "ADD_TO_OPPORTUNITIES"
  | "REVIEW_RESULTS"
  | "CONTINUE_ANALYSIS"
  | "NONE";

export type NextActionInput = {
  analysisPresent: boolean;
  fitScore: number | null;
  reanalysisNeeded?: boolean;
  hasCompletedGeneration: boolean;
  opportunityAlreadySaved: boolean;
  generationAllowed?: boolean;
  hasUnverifiedRequirements?: boolean;
  jobId?: string | null;
  baselineId?: string | null;
};

export type NextAction = {
  action: NextActionType;
  label: string;
  description: string;
};

export function derivePrimaryNextAction(input: NextActionInput): NextAction {
  if (!input.analysisPresent) {
    return {
      action: "CONTINUE_ANALYSIS",
      label: "Continue Analysis",
      description: "Analyze this role to get a verified decision path.",
    };
  }

  if (input.reanalysisNeeded) {
    return {
      action: "REANALYZE",
      label: "Reanalyze Role",
      description: "You've added evidence. Reanalyze to measure the impact.",
    };
  }

  if (typeof input.fitScore === "number" && input.fitScore < 70) {
    return {
      action: "RESOLVE_GAPS",
      label: "Resolve Gaps",
      description: "This role needs stronger proof before generation will be useful.",
    };
  }

  if (!input.hasCompletedGeneration) {
    return {
      action: "GENERATE_RESUME",
      label: "Generate Resume",
      description: "You've cleared the threshold. Generate tailored materials now.",
    };
  }

  if (!input.opportunityAlreadySaved) {
    return {
      action: "ADD_TO_OPPORTUNITIES",
      label: "Add to Opportunities",
      description: "Your materials are ready. Add this role to Opportunities.",
    };
  }

  return {
    action: "REVIEW_RESULTS",
    label: "Review Results",
    description: "Everything is saved. Review details or choose your next role.",
  };
}

export function getGenerationCompletionStorageKey(jobId?: string | null, baselineId?: string | null): string | null {
  const safeJobId = jobId?.trim() ?? "";
  const safeBaselineId = baselineId?.trim() ?? "";
  if (!safeJobId || !safeBaselineId) return null;
  return `ttr-generation-complete:${safeJobId}:${safeBaselineId}`;
}
