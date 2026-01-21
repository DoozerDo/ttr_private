import { buildResultsUrl } from "@/app/(app)/baseline/_components/WorkspaceRunner";

describe("buildResultsUrl", () => {
  it("prefers assessmentId when available", () => {
    const url = buildResultsUrl({
      assessmentId: "assessment-123",
      jobId: "job-456",
      baselineId: "baseline-789",
    });
    expect(url).toBe("/results?assessmentId=assessment-123");
  });

  it("falls back to jobId and baselineId when assessmentId is missing", () => {
    const url = buildResultsUrl({
      jobId: "job-456",
      baselineId: "baseline-789",
    });
    expect(url).toBe("/results?jobId=job-456&baselineId=baseline-789");
  });

  it("returns null when no identifiers are provided", () => {
    expect(buildResultsUrl({})).toBeNull();
  });
});
