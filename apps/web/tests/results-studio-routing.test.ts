import { buildStudioHrefFromResultsContext } from "@/app/(app)/results/page";
import { resolveResultsDecision } from "@/lib/resultsDecisionResolver";

describe("Results to Studio routing", () => {
  it("routes to Studio with role analysis and explicit baseline context", () => {
    expect(
      buildStudioHrefFromResultsContext({
        jobId: "job-1",
        baselineId: "base-1",
        baselineVersionId: "base-version-4",
        analysisId: "analysis-88",
      }),
    ).toBe(
      "/studio?jobId=job-1&analysisId=analysis-88&baselineId=base-1&baselineVersionId=base-version-4",
    );
  });

  it("preserves analysis-only context when no baseline is present", () => {
    expect(
      buildStudioHrefFromResultsContext({
        analysisId: "analysis-42",
      }),
    ).toBe("/studio?analysisId=analysis-42");
  });

  it("keeps strong-fit users routed to Studio even when evidence is only medium confidence", () => {
    expect(
      resolveResultsDecision({
        score: 82,
        generationReadiness: {
          state: "ALLOWED",
          confidence: "MEDIUM",
          needsVerification: true,
        },
      }).primaryCta,
    ).toBe("OPEN_STUDIO");
  });
});
