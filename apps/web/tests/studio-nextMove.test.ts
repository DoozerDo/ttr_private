import { describe, expect, it, vi } from "vitest";

import { resolveStudioNextMove } from "@/src/lib/studio/nextMove";

const actions = {
  generateResume: vi.fn(),
  generateCoverLetter: vi.fn(),
  reviewTopGaps: vi.fn(),
  improveExperience: vi.fn(),
  analyzeAnotherRole: vi.fn(),
  learnSupportedInputs: vi.fn(),
  retryGeneration: vi.fn(),
};

type StudioDecision = Parameters<typeof resolveStudioNextMove>[0]["decision"];

function createDecision(
  readinessState: StudioDecision["readinessState"],
  nextActionType: StudioDecision["nextAction"]["type"],
): StudioDecision {
  return {
    readinessState,
    nextAction: {
      type: nextActionType,
      label:
        nextActionType === "studio_with_save"
          ? "Generate Resume"
          : nextActionType === "studio"
            ? "Open Resume & Cover Letter Studio"
            : "Start Fit Review",
      route: nextActionType === "fit_review" ? "/fit-review" : "/studio",
      reason: "test",
    },
  } as StudioDecision;
}

function createMove(overrides: Partial<Parameters<typeof resolveStudioNextMove>[0]> = {}) {
  return resolveStudioNextMove({
    decision: createDecision("READY", "studio"),
    analysisScore: 82,
    artifactFailure: null,
    actions,
    ...overrides,
  });
}

describe("resolveStudioNextMove", () => {
  it("returns a strong-fit move with generate actions", () => {
    const move = createMove({
      analysisScore: 84,
      decision: createDecision("READY", "studio"),
    });
    expect(move.title).toContain("ready to generate grounded materials");
    expect(move.primaryAction.label).toBe("Generate Resume");
    expect(move.secondaryAction?.label).toBe("Generate Cover Letter");
  });

  it("returns a fit-review move when the canonical decision is blocked", () => {
    const move = createMove({
      analysisScore: 63,
      decision: createDecision("BLOCKED", "fit_review"),
    });
    expect(move.title).toBe("Complete your profile before generating");
    expect(move.primaryAction.label).toBe("Continue Building Experience");
    expect(move.secondaryAction).toBeUndefined();
  });

  it("returns a generation-blocked move with one primary action", () => {
    const move = createMove({
      decision: createDecision("BLOCKED", "fit_review"),
    });
    expect(move.title).toBe("Complete your profile before generating");
    expect(move.primaryAction.label).toBe("Continue Building Experience");
    expect(move.secondaryAction).toBeUndefined();
  });

  it("prefers failure-specific messaging when generation fails", () => {
    const move = resolveStudioNextMove({
      decision: createDecision("READY", "studio"),
      analysisScore: 82,
      artifactFailure: {
        category: "validation_failure",
        explanation: "Validation failed",
        detail: "Invalid output",
        retryable: true,
      },
      actions,
    });

    expect(move.title).toBe("We couldn’t generate a reliable result");
    expect(move.primaryAction.label).toBe("Retry Generation");
  });
});
