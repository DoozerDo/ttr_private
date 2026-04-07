import { describe, expect, it } from "vitest";

import { resolveResultsDecision } from "@/lib/resultsDecisionResolver";

describe("resolveResultsDecision", () => {
  it("blocks strong fit when readiness is blocked", () => {
    expect(
      resolveResultsDecision({
        score: 92,
        generationReadinessStatus: "blocked",
      }),
    ).toMatchObject({
      state: "BLOCKED",
      primaryCta: "START_FIT_REVIEW",
      headline: "Strong fit. Not ready to generate yet.",
    });
  });

  it("opens Studio in draft mode when readiness is limited", () => {
    expect(
      resolveResultsDecision({
        score: 92,
        generationReadinessStatus: "limited",
      }),
    ).toMatchObject({
      state: "DRAFT",
      primaryCta: "OPEN_STUDIO",
      headline: "Strong fit. Studio is available, but evidence is still thin.",
    });
  });

  it("opens Studio when readiness is ready", () => {
    expect(
      resolveResultsDecision({
        score: 84,
        generationReadinessStatus: "ready",
      }),
    ).toMatchObject({
      state: "READY",
      primaryCta: "OPEN_STUDIO",
      headline: "Strong fit. Studio is ready.",
    });
  });

  it("keeps the improvement loop for low fit even when readiness is blocked", () => {
    expect(
      resolveResultsDecision({
        score: 62,
        generationReadinessStatus: "blocked",
      }),
    ).toMatchObject({
      state: "IMPROVE",
      primaryCta: "START_FIT_REVIEW",
    });
  });
});
