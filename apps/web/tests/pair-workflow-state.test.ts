import { describe, expect, it } from "vitest";

import type { CanonicalDecisionResult } from "@/lib/canonicalDecision";
import { resolvePairWorkflowState } from "@/lib/pairWorkflowState";

function baseCanonicalDecision(overrides?: Partial<CanonicalDecisionResult>): CanonicalDecisionResult {
  return {
    surface: "results",
    score: 78,
    readinessState: "READY",
    scoreSource: "test",
    readinessSource: "test",
    nextAction: { type: "studio", label: "Open Studio", route: "/studio", reason: "test" },
    cta: { label: "Open Studio", href: "/studio", actionType: "open_studio" },
    workflowState: "results_ready",
    primaryAction: {
      type: "open_studio",
      label: "Open Studio",
      destination: "/studio",
      kind: "navigate",
      isEnabled: true,
    },
    blockingReason: null,
    supportingMessage: "test",
    pairKey: "b:j",
    dataSource: "fresh",
    persistedAssessmentId: "a",
    contractSource: "test",
    ...overrides,
  };
}

describe("resolvePairWorkflowState", () => {
  it("returns missing_context when baseline/job ids are missing", () => {
    const state = resolvePairWorkflowState({
      baselineId: null,
      jobId: "job",
      canonicalDecision: baseCanonicalDecision(),
      artifacts: { resume: "missing", coverLetter: "missing" },
    });
    expect(state.pairStatus).toBe("missing_context");
    expect(state.primaryCta).toBe("fix_context");
    expect(state.blockingReason).toMatch(/Select a baseline and role/i);
  });

  it("returns generated + view_documents when any artifact is ready", () => {
    const decision = baseCanonicalDecision({ score: 82 });
    const resultsState = resolvePairWorkflowState({
      baselineId: "b",
      jobId: "j",
      canonicalDecision: decision,
      artifacts: { resume: "ready", coverLetter: "missing" },
    });
    const studioState = resolvePairWorkflowState({
      baselineId: "b",
      jobId: "j",
      canonicalDecision: decision,
      artifacts: { resume: "ready", coverLetter: "missing" },
    });
    expect(resultsState.score).toBe(82);
    expect(studioState.score).toBe(82);
    expect(resultsState.canGenerate).toBe(true);
    expect(studioState.canGenerate).toBe(true);
    expect(resultsState.primaryCta).toBe("view_documents");
    expect(studioState.primaryCta).toBe("view_documents");
    expect(resultsState.blockingReason).toBeNull();
    expect(studioState.blockingReason).toBeNull();
  });

  it("returns generating when artifacts are generating", () => {
    const decision = baseCanonicalDecision({ score: 78 });
    const state = resolvePairWorkflowState({
      baselineId: "b",
      jobId: "j",
      canonicalDecision: decision,
      artifacts: { resume: "generating", coverLetter: "pending" },
    });
    expect(state.pairStatus).toBe("generating");
    expect(state.primaryCta).toBe("view_documents");
  });

  it("returns generation_failed when any artifact failed", () => {
    const decision = baseCanonicalDecision({ score: 78 });
    const state = resolvePairWorkflowState({
      baselineId: "b",
      jobId: "j",
      canonicalDecision: decision,
      artifacts: { resume: "failed", coverLetter: "missing" },
    });
    expect(state.pairStatus).toBe("generation_failed");
    expect(state.primaryCta).toBe("generate");
    expect(state.blockingReason).toMatch(/Generation failed/i);
  });
});

