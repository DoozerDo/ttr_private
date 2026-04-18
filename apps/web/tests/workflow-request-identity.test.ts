import { describe, expect, it } from "vitest";

import { buildWorkflowRequestKey } from "@/lib/workflowRequestGuard";

describe("workflow request identity", () => {
  it("generation dedupe must not churn when baselineVersionId changes", () => {
    const scopeV1 = { baselineId: "base-1", jobId: "job-1", baselineVersionId: "v1" };
    const scopeV2 = { baselineId: "base-1", jobId: "job-1", baselineVersionId: "v2" };
    expect(buildWorkflowRequestKey("resume", scopeV1)).not.toBe(buildWorkflowRequestKey("resume", scopeV2));

    const generationScope = { baselineId: "base-1", jobId: "job-1", baselineVersionId: null };
    expect(buildWorkflowRequestKey("resume", generationScope)).toBe(buildWorkflowRequestKey("resume", generationScope));
  });
});

