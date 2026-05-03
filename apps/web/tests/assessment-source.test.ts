import { extractAssessmentsFromPayload } from "@/lib/assessmentSource";

describe("assessment source normalization", () => {
  it("extracts canonical assessment from standard payload", () => {
    const result = extractAssessmentsFromPayload({
      assessments: [
        {
          assessmentId: "a-1",
          baselineId: "b-1",
          score: 88,
          createdAt: "2026-03-25T00:00:00.000Z",
          compliance_flags: [],
          scoringReliability: "unreliable",
          scoringReliabilityReason: "job_description_terms_empty",
        },
      ],
    });

    expect(result).toEqual([
      {
        assessmentId: "a-1",
        baselineId: "b-1",
        score: 88,
        createdAt: "2026-03-25T00:00:00.000Z",
        complianceFlags: [],
        scoringReliability: "unreliable",
        scoringReliabilityReason: "job_description_terms_empty",
      },
    ]);
  });

  it("handles id fallback and numeric score strings", () => {
    const result = extractAssessmentsFromPayload([
      {
        id: "a-2",
        baselineId: "b-2",
        score: "91.5",
        complianceFlags: [{ code: "limited_personalization", severity: "warn" }],
      },
    ]);

    expect(result[0]?.assessmentId).toBe("a-2");
    expect(result[0]?.score).toBe(91.5);
    expect(result[0]?.scoringReliability).toBe("ok");
    expect(result[0]?.scoringReliabilityReason).toBeUndefined();
  });
});
