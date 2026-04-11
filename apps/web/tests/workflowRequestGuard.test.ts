import { describe, expect, it } from "vitest";

import {
  buildWorkflowPairKey,
  buildWorkflowRequestKey,
  isWorkflowRequestStale,
} from "@/lib/workflowRequestGuard";

describe("workflowRequestGuard", () => {
  it("builds stable request keys and detects pair mismatches", () => {
    const scope = {
      baselineId: "base-1",
      jobId: "job-1",
      baselineVersionId: "version-1",
    };

    expect(buildWorkflowPairKey(scope)).toBe("base-1:job-1:version-1");
    expect(buildWorkflowRequestKey("resume", scope)).toBe("resume:base-1:job-1:version-1");
    expect(
      isWorkflowRequestStale(
        scope,
        {
          baselineId: "base-1",
          jobId: "job-1",
          baselineVersionId: "version-1",
        },
      ),
    ).toBe(false);
    expect(
      isWorkflowRequestStale(
        scope,
        {
          baselineId: "base-2",
          jobId: "job-1",
          baselineVersionId: "version-1",
        },
      ),
    ).toBe(true);
  });
});

