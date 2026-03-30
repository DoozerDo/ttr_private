import {
  buildResultsUrl,
  resolveScoreBandPresentation,
} from "@/app/(app)/baseline/_components/WorkspaceRunner";

describe("buildResultsUrl", () => {
  it("prefers assessmentId when available", () => {
    const url = buildResultsUrl({
      assessmentId: "assessment-123",
      jobId: "job-456",
      baselineId: "baseline-789",
    });
    expect(url).toBe(
      "/results?assessmentId=assessment-123&analysisId=assessment-123&jobId=job-456&baselineId=baseline-789",
    );
  });

  it("falls back to jobId and baselineId when assessmentId is missing", () => {
    const url = buildResultsUrl({
      jobId: "job-456",
      baselineId: "baseline-789",
    });
    expect(url).toBe("/results?jobId=job-456&baselineId=baseline-789");
  });

  it("preserves analysisId when only assessmentId is available", () => {
    const url = buildResultsUrl({
      assessmentId: "assessment-123",
    });
    expect(url).toBe("/results?assessmentId=assessment-123&analysisId=assessment-123");
  });

  it("returns null when no identifiers are provided", () => {
    expect(buildResultsUrl({})).toBeNull();
  });
});

describe("resolveScoreBandPresentation", () => {
  it("returns prime band for scores >=90", () => {
    expect(resolveScoreBandPresentation(95)).toMatchObject({
      key: "prime",
      label: "Primary readiness",
    });
  });

  it("returns strong band for scores 80-89", () => {
    expect(resolveScoreBandPresentation(90)).toMatchObject({
      key: "prime",
      label: "Primary readiness",
    });
    expect(resolveScoreBandPresentation(87)).toMatchObject({
      key: "strong",
      label: "Strong Match",
    });
  });

  it("returns competitive band for scores 70-79", () => {
    expect(resolveScoreBandPresentation(78)).toMatchObject({
      key: "competitive",
      label: "Competitive Match",
    });
  });

  it("returns possible band for scores 60-69", () => {
    expect(resolveScoreBandPresentation(62)).toMatchObject({
      key: "possible",
      label: "Possible Fit",
    });
  });

  it("returns low band for scores below 60", () => {
    expect(resolveScoreBandPresentation(40)).toMatchObject({
      key: "low",
      label: "Low Match",
    });
  });
});
