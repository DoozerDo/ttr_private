export type NextActionType =
  | "fit_review"
  | "studio"
  | "studio_with_save";

export type NextActionInput = {
  fitScore: number | null;
  generationReady: boolean;
  trustGateAllowed: boolean;
  opportunityAlreadySaved?: boolean;
};

export type NextAction = {
  type: NextActionType;
  label: string;
  route: string;
  reason: string;
};

function buildAction(type: NextActionType, reason: string): NextAction {
  if (type === "fit_review") {
    return {
      type,
      label: "Start Fit Review",
      route: "/fit-review",
      reason,
    };
  }
  if (type === "studio") {
    return {
      type,
      label: "Open Resume & Cover Letter Studio",
      route: "/studio",
      reason,
    };
  }
  return {
    type,
    label: "Generate Resume",
    route: "/studio",
    reason,
  };
}

export function getCanonicalNextAction(input: NextActionInput): NextAction {
  const score = typeof input.fitScore === "number" ? input.fitScore : 0;
  if (score < 70) {
    return buildAction("fit_review", "score below 70");
  }
  if (!input.generationReady || !input.trustGateAllowed) {
    return buildAction(
      "fit_review",
      !input.generationReady
        ? "score >= 70 but readiness not ready"
        : "score >= 70 but trust gate blocked generation",
    );
  }
  if (score >= 85) {
    return buildAction("studio_with_save", "score >= 85 and readiness ready");
  }
  return buildAction("studio", "score >= 70 and readiness ready");
}

export function getPrimaryAction(input: NextActionInput | number): NextAction {
  if (typeof input === "number") {
    return getCanonicalNextAction({
      fitScore: input,
      generationReady: true,
      trustGateAllowed: true,
    });
  }
  return getCanonicalNextAction(input);
}

export function derivePrimaryNextAction(input: NextActionInput): NextAction {
  return getCanonicalNextAction(input);
}

export function getGenerationCompletionStorageKey(jobId?: string | null, baselineId?: string | null): string | null {
  const safeJobId = jobId?.trim() ?? "";
  const safeBaselineId = baselineId?.trim() ?? "";
  if (!safeJobId || !safeBaselineId) return null;
  return `ttr-generation-complete:${safeJobId}:${safeBaselineId}`;
}
