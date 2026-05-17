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
    expect(decision.state).toBe("READY");
    expect(decision.headline).toBe("Strong match. Generation is ready.");
    expect(decision.subtext).toBe(
      "Your materials are ready to generate now. Review them in Studio before applying.",
    );
  });
});
