import { describe, expect, it } from "vitest";

import { buildResultsDecisionCopy } from "@/lib/resultsMessaging";

describe("results messaging", () => {
  it("keeps the blocked fit copy aligned with the shared score boundary", () => {
    expect(
      buildResultsDecisionCopy({
        score: 70,
        generationReadiness: {
          state: "BLOCKED",
          confidence: "LOW",
          needsVerification: true,
        },
      }),
    ).toMatchObject({
      headline: "Competitive fit. Not ready to generate yet.",
    });
    expect(
      buildResultsDecisionCopy({
        score: 74,
        generationReadiness: {
          state: "BLOCKED",
          confidence: "LOW",
          needsVerification: true,
        },
      }),
    ).toMatchObject({
      headline: "Promising fit. Not ready to generate yet.",
    });
  });
});
