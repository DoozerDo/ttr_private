import { describe, expect, it } from "vitest";

import { resolveResultsDecision } from "@/lib/resultsDecisionResolver";

describe("results to studio confidence", () => {
  it("keeps the Results call to action aligned with Studio confidence messaging", () => {
    const decision = resolveResultsDecision({
      score: 84,
      generationReadiness: {
        state: "ALLOWED",
        confidence: "MEDIUM",
        needsVerification: true,
      },
    });

    expect(decision.primaryCta).toBe("OPEN_STUDIO");
    expect(decision.headline).toBe("You're a strong match. You can generate now.");
    expect(decision.subtext).toBe(
      "Generate now. Then strengthen your output by verifying key claims in Studio.",
    );
  });
});
