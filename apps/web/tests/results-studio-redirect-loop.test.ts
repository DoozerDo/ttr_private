import { describe, expect, it } from "vitest";

import { resolveResultsStudioRedirect } from "@/lib/resolveResultsStudioRedirect";

describe("results <-> studio redirect authority (loop prevention)", () => {
  it("auto-routes Results -> Studio only with stable pair context at score >= 80", () => {
    const decision = resolveResultsStudioRedirect({
      from: "results",
      pathname: "/results",
      locked: false,
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      baselineVersionId: "base-version-1",
      score: 84,
      hasAnyUsableOutput: false,
      generationReadinessBlocked: false,
    });
    expect(decision.redirectTo).toContain("/studio?");
    expect(decision.redirectTo).toContain("baselineId=base-1");
    expect(decision.redirectTo).toContain("jobId=job-1");
    expect(decision.redirectTo).toContain("analysisId=analysis-1");
  });

  it("does not auto-route Results -> Studio when pair context is missing (prevents ping pong)", () => {
    const decision = resolveResultsStudioRedirect({
      from: "results",
      pathname: "/results",
      locked: false,
      baselineId: null,
      jobId: null,
      analysisId: "analysis-1",
      baselineVersionId: null,
      score: 84,
      hasAnyUsableOutput: false,
      generationReadinessBlocked: false,
    });
    expect(decision.redirectTo).toBeNull();
    expect(decision.reason).toBe("missing_pair_context");
  });

  it("does not redirect Studio -> Results for score >= 80 even if readiness is blocked (no loop)", () => {
    const decision = resolveResultsStudioRedirect({
      from: "studio",
      pathname: "/studio",
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      baselineVersionId: "base-version-1",
      score: 84,
      hasAnyUsableOutput: false,
      generationReadinessBlocked: true,
    });
    expect(decision.redirectTo).toBeNull();
  });

  it("does not auto-route Results -> Studio when Results is locked by a Studio redirect (prevents loops)", () => {
    const decision = resolveResultsStudioRedirect({
      from: "results",
      pathname: "/results?locked=1",
      locked: true,
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      baselineVersionId: "base-version-1",
      score: 84,
      hasAnyUsableOutput: false,
      generationReadinessBlocked: false,
    });
    expect(decision.redirectTo).toBeNull();
    expect(decision.reason).toBe("results_locked_no_auto_route");
  });

  it("redirects Studio -> Results (locked) only for true low-fit (<70) with no usable output", () => {
    const decision = resolveResultsStudioRedirect({
      from: "studio",
      pathname: "/studio",
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      baselineVersionId: "base-version-1",
      score: 68,
      hasAnyUsableOutput: false,
      generationReadinessBlocked: false,
    });
    expect(decision.redirectTo).toContain("/results?");
    expect(decision.redirectTo).toContain("locked=1");
    expect(decision.redirectTo).toContain("baselineId=base-1");
    expect(decision.redirectTo).toContain("jobId=job-1");
    expect(decision.redirectTo).toContain("assessmentId=analysis-1");
  });
});
