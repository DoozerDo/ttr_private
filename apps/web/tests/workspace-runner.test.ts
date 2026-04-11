import {
  buildResultsUrl,
  extractCriticalGaps,
  extractFallbackEvidence,
  resolveScoreBandPresentation,
} from "@/app/(app)/baseline/_components/WorkspaceRunner";
import { FALLBACK_RENDERED_TEXT } from "@/lib/renderedText";

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

describe("workspace runner text normalization", () => {
  it("sanitizes malformed target payload text before it can be displayed", () => {
    const gaps = extractCriticalGaps({
      criticalGaps: [
        {
          title: "{{broken target text}}",
          requirementEvidence: "Own enterprise support tooling",
          baselineEvidence: "Led support tooling rollout across queues",
          severityScore: 0.78,
        },
      ],
    } as never);

    expect(gaps[0].title).toBe(FALLBACK_RENDERED_TEXT);
    expect(extractFallbackEvidence({ strengths: ["{{bad}}", "Delivered measurable support operations"] } as never)).toEqual([
      "Delivered measurable support operations",
    ]);
  });
});
