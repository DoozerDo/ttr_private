import { buildStudioHrefFromResultsContext } from "@/app/(app)/results/page";

describe("Results to Studio routing", () => {
  it("routes to Studio with job, baseline, and baseline version context", () => {
    expect(
      buildStudioHrefFromResultsContext({
        jobId: "job-1",
        baselineId: "base-1",
        baselineVersionId: "base-version-4",
      }),
    ).toBe("/studio?jobId=job-1&baselineId=base-1&baselineVersionId=base-version-4");
  });

  it("falls back gracefully when only job context is available", () => {
    expect(
      buildStudioHrefFromResultsContext({
        jobId: "job-1",
        baselineId: "",
        baselineVersionId: null,
      }),
    ).toBe("/studio?jobId=job-1");
  });
});
