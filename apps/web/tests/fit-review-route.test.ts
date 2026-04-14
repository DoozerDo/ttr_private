import { describe, expect, it } from "vitest";

import { getFitReviewHref } from "@/src/navigation/routes";

describe("fit review route helper", () => {
  it("preserves the canonical fit-review destination shape", () => {
    expect(
      getFitReviewHref({
        jobId: "job-1",
        baselineId: "base-1",
        baselineVersionId: "base-version-1",
        assessmentId: "analysis-1",
        analysisId: "analysis-1",
        highlightClaim: "claim-1",
        locked: true,
      }),
    ).toBe(
      "/fit-review?jobId=job-1&analysisId=analysis-1&assessmentId=analysis-1&baselineId=base-1&baselineVersionId=base-version-1&highlightClaim=claim-1&locked=1",
    );
  });
});
