import { describe, expect, it } from "vitest";

import { resolveResultsDecision } from "@/lib/resultsDecisionResolver";

describe("resolveResultsDecision", () => {
  it("BLOCKED overrides everything", () => {
    expect(
      resolveResultsDecision({
        score: 92,
        generationBlocked: true,
        hasVerifiedEvidence: true,
        hasGaps: false,
      }),
    ).toMatchObject({ state: "BLOCKED" });
  });

  it("no evidence triggers BLOCKED", () => {
    expect(
      resolveResultsDecision({
        score: 92,
        generationBlocked: false,
        hasVerifiedEvidence: false,
        hasGaps: false,
      }),
    ).toMatchObject({ state: "BLOCKED" });
  });

  it("READY requires score, evidence, and no gaps", () => {
    expect(
      resolveResultsDecision({
        score: 80,
        generationBlocked: false,
        hasVerifiedEvidence: true,
        hasGaps: false,
      }),
    ).toMatchObject({ state: "READY", primaryCta: "OPEN_STUDIO" });
  });

  it("otherwise returns IMPROVE", () => {
    expect(
      resolveResultsDecision({
        score: 79,
        generationBlocked: false,
        hasVerifiedEvidence: true,
        hasGaps: true,
      }),
    ).toMatchObject({ state: "IMPROVE", primaryCta: "START_FIT_REVIEW" });
  });
});
