export type DecisionFlowDataSource = "fresh" | "persisted" | "mixed";

export type DecisionFlowLogPayload = {
  event: string;
  entrySource?: string | null;
  baselineId: string | null;
  jobId: string | null;
  pairKey?: string | null;
  score: number | null;
  readinessState: string;
  contractSource: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  resolvedRoute?: string | null;
  actionType: string | null;
  legacyFallbackAttempted?: boolean;
  legacyFallbackBlocked?: boolean;
  analyticsPayload: Record<string, unknown> | null;
  dataSource: DecisionFlowDataSource;
  persistedAssessmentId: string | null;
  timestamp: string;
};

export type DecisionFlowLogInput = Omit<DecisionFlowLogPayload, "timestamp"> & {
  timestamp?: string | Date;
};

function toTimestamp(value?: string | Date): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return new Date().toISOString();
}

export function shouldEmitDecisionFlowLogs(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_DECISION_FLOW === "true";
}

export function buildDecisionFlowLogPayload(input: DecisionFlowLogInput): DecisionFlowLogPayload {
  return {
    ...input,
    timestamp: toTimestamp(input.timestamp),
  };
}

export function logDecisionFlowEvent(input: DecisionFlowLogInput): DecisionFlowLogPayload {
  const payload = buildDecisionFlowLogPayload(input);
  if (shouldEmitDecisionFlowLogs()) {
    console.info("[decision-flow]", payload);
  }
  return payload;
}
