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
    primaryNextAction: "studio",
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
});
