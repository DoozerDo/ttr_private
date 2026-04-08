import { describe, expect, it } from "vitest";

import { resolveResultsDecision } from "@/lib/resultsDecisionResolver";

describe("resolveResultsDecision", () => {
  it("routes strong fit to Studio even when confidence is medium", () => {
    expect(
      resolveResultsDecision({
        score: 92,
        generationReadiness: {
          state: "ALLOWED",
          confidence: "MEDIUM",
          needsVerification: true,
        },
      }),
    ).toMatchObject({
      state: "DRAFT",
      primaryCta: "OPEN_STUDIO",
      headline: "You're a strong match. You can generate now.",
      subtext: "Some claims are unverified. You can strengthen your output in Studio.",
    });
  });

  it("opens Studio when strong fit is backed by verified evidence", () => {
    expect(
      resolveResultsDecision({
        score: 84,
        generationReadiness: {
          state: "ALLOWED",
          confidence: "HIGH",
          needsVerification: false,
        },
      }),
    ).toMatchObject({
      state: "READY",
      primaryCta: "OPEN_STUDIO",
      headline: "You're a strong match. You can generate now.",
    });
  });

  it("opens Studio when readiness is ready for a competitive fit", () => {
    expect(
      resolveResultsDecision({
        score: 84,
        generationReadiness: {
          state: "ALLOWED",
          confidence: "HIGH",
          needsVerification: false,
        },
      }),
    ).toMatchObject({
      state: "READY",
      primaryCta: "OPEN_STUDIO",
      headline: "You're a strong match. You can generate now.",
    });
  });

  it("keeps the improvement loop for low fit even when readiness is blocked", () => {
    expect(
      resolveResultsDecision({
        score: 62,
        generationReadiness: {
          state: "BLOCKED",
          confidence: "LOW",
          needsVerification: true,
        },
      }),
    ).toMatchObject({
      state: "IMPROVE",
      primaryCta: "START_FIT_REVIEW",
    });
  });
});
