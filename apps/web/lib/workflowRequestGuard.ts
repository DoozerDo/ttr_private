export type WorkflowRequestScope = {
  baselineId: string | null;
  jobId: string | null;
  baselineVersionId?: string | null;
  analysisId?: string | null;
  sessionId?: string | null;
};

export type WorkflowRequestEvent =
  | "request_started"
  | "request_completed"
  | "request_failed"
  | "request_timeout"
  | "request_blocked"
  | "stale_response_dropped"
  | "duplicate_request_ignored"
  | "pair_mismatch_dropped";

function clean(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function buildWorkflowPairKey(scope: WorkflowRequestScope): string | null {
  const baselineId = clean(scope.baselineId);
  const jobId = clean(scope.jobId);
  if (!baselineId || !jobId) return null;
  const baselineVersionId = clean(scope.baselineVersionId);
  return [baselineId, jobId, baselineVersionId || "_"].join(":");
}

export function buildWorkflowRequestKey(action: string, scope: WorkflowRequestScope): string | null {
  const pairKey = buildWorkflowPairKey(scope);
  if (!pairKey) return null;
  return `${action}:${pairKey}`;
}

export function matchesWorkflowScope(
  expected: WorkflowRequestScope,
  current: WorkflowRequestScope,
): boolean {
  return buildWorkflowRequestKey("scope", expected) === buildWorkflowRequestKey("scope", current);
}

export function logWorkflowRequestEvent(
  event: WorkflowRequestEvent,
  input: {
    action: string;
    expected: WorkflowRequestScope;
    current?: WorkflowRequestScope;
    requestId?: string | null;
    durationMs?: number | null;
    reason?: string | null;
    source?: string | null;
  },
) {
  const payload = {
    event,
    action: input.action,
    requestId: input.requestId ?? null,
    expectedPairKey: buildWorkflowPairKey(input.expected),
    expectedBaselineId: clean(input.expected.baselineId) || null,
    expectedJobId: clean(input.expected.jobId) || null,
    expectedBaselineVersionId: clean(input.expected.baselineVersionId) || null,
    currentPairKey: input.current ? buildWorkflowPairKey(input.current) : null,
    currentBaselineId: input.current ? clean(input.current.baselineId) || null : null,
    currentJobId: input.current ? clean(input.current.jobId) || null : null,
    currentBaselineVersionId: input.current ? clean(input.current.baselineVersionId) || null : null,
    durationMs: typeof input.durationMs === "number" ? input.durationMs : null,
    reason: input.reason ?? null,
    source: input.source ?? null,
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_DECISION_FLOW === "true") {
    console.info("[workflow-request]", payload);
  }

  return payload;
}

export function isWorkflowRequestStale(
  expected: WorkflowRequestScope,
  current: WorkflowRequestScope,
): boolean {
  return !matchesWorkflowScope(expected, current);
}

