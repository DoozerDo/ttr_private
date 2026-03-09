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

describe("resolveScoreBandPresentation", () => {
  it("returns exceptional band for scores >=95", () => {
    expect(resolveScoreBandPresentation(95)).toMatchObject({
      key: "exceptional",
      label: "Exceptional Match",
      ctaLabel: "Review your results",
      ctaTarget: "results",
    });
  });

  it("returns strong band for scores 85-94", () => {
    expect(resolveScoreBandPresentation(90)).toMatchObject({
      key: "strong",
      label: "Strong Match",
      ctaLabel: "Review your results",
      ctaTarget: "results",
    });
  });

  it("returns competitive band for scores 70-84", () => {
    expect(resolveScoreBandPresentation(78)).toMatchObject({
      key: "competitive",
      label: "Competitive Match",
      ctaLabel: "Review your results",
      ctaTarget: "results",
    });
  });

  it("returns borderline band for scores 50-69", () => {
    expect(resolveScoreBandPresentation(62)).toMatchObject({
      key: "borderline",
      label: "Promising but Incomplete",
      ctaLabel: "Improve Fit",
      ctaTarget: "fitReview",
    });
  });

  it("returns weak band for scores below 50", () => {
    expect(resolveScoreBandPresentation(40)).toMatchObject({
      key: "weak",
      label: "Not Ready Yet",
      ctaLabel: "Open Fit Review",
      ctaTarget: "fitReview",
    });
  });
});
