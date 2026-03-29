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

function createMove(overrides: Partial<Parameters<typeof resolveStudioNextMove>[0]>) {
  return resolveStudioNextMove({
    analysisScore: 82,
    canGenerateDocuments: true,
    studioGenerationState: "READY",
    primaryNextAction: "GENERATE_RESUME",
    artifactFailure: null,
    actions,
    ...overrides,
  });
}

describe("resolveStudioNextMove", () => {
  it("returns a strong-fit move with generate actions", () => {
    const move = createMove({ analysisScore: 84, canGenerateDocuments: true });
    expect(move.title).toBe("You’re ready to generate");
    expect(move.primaryAction.label).toBe("Generate Resume");
    expect(move.secondaryAction?.label).toBe("Generate Cover Letter");
  });

  it("returns a moderate-fit move with decisive gap-fixing guidance", () => {
    const move = createMove({ analysisScore: 63, canGenerateDocuments: true });
    expect(move.title).toBe("Fix the gaps before applying");
    expect(move.primaryAction.label).toBe("Review Top Gaps");
    expect(move.secondaryAction?.label).toBe("Generate Anyway");
  });

  it("returns a low-fit move without hedging", () => {
    const move = createMove({ analysisScore: 42, canGenerateDocuments: false });
    expect(move.title).toBe("You’re not competitive for this role");
    expect(move.primaryAction.label).toBe("Improve Experience");
    expect(move.secondaryAction?.label).toBe("Analyze Another Role");
  });

  it("returns a generation-blocked move with one primary action", () => {
    const move = createMove({ studioGenerationState: "BLOCKED", canGenerateDocuments: false });
    expect(move.title).toBe("Complete your profile before generating");
    expect(move.primaryAction.label).toBe("Continue Building Experience");
    expect(move.secondaryAction).toBeUndefined();
  });

  it("returns an unsupported-input move with consequence-first language", () => {
    const move = createMove({
      artifactFailure: {
        code: "insufficient_extracted_text",
        category: "unsupported_input",
        message: "Unable to extract enough text.",
        retryable: false,
      },
    });
    expect(move.title).toBe("This input won’t generate a reliable result");
    expect(move.primaryAction.label).toBe("Fix Input");
    expect(move.secondaryAction?.label).toBe("Learn What’s Supported");
  });

  it("returns a trace-failure move with safety-focused language", () => {
    const move = createMove({
      artifactFailure: {
        code: "generation_failed",
        category: "trace_failure",
        message: "Unable to verify every line.",
        retryable: true,
      },
    });
    expect(move.title).toBe("We couldn’t verify this safely");
    expect(move.primaryAction.label).toBe("Improve Baseline Clarity");
    expect(move.secondaryAction?.label).toBe("Retry Generation");
  });

  it("returns a clear fallback for generation failure", () => {
    const move = createMove({
      artifactFailure: {
        code: "generation_failed",
        category: "generation_failed",
        message: "Generation failed.",
        retryable: false,
      },
    });
    expect(move.title).toBe("We couldn’t generate a reliable result");
    expect(move.primaryAction.label).toBe("Adjust Input");
    expect(move.secondaryAction).toBeUndefined();
  });
});
