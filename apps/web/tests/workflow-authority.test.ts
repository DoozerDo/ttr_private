import { describe, expect, it } from "vitest";

import type { GenerationReadiness } from "@/lib/generationReadiness";
import { resolveWorkflowAuthority } from "@/lib/resolveWorkflowAuthority";

function readiness(overrides?: Partial<GenerationReadiness>): GenerationReadiness {
  return {
    status: "ready",
    blocked: false,
    reasonCodes: [],
    reasons: [],
    badgeLabel: "READY",
    summary: "ready",
    verificationIssues: [],
    ...overrides,
  };
}

describe("resolveWorkflowAuthority", () => {
  it("returns READY + suppressFailureMessaging when any usable output exists (resume success + cover fail)", () => {
    const result = resolveWorkflowAuthority({
      score: 75,
      generationReadiness: readiness({ blocked: true, status: "blocked" }),
      resumeState: { hasOutput: true, failed: false },
      coverState: { hasOutput: false, failed: true },
      isPro: true,
      hasGeneratedOnce: true,
      isHydrating: false,
    });

    expect(result.workflowState).toBe("READY");
    expect(result.suppressFailureMessaging).toBe(true);
    expect(result.primaryAction).toBe("RETRY");
    expect(result.headline).toBe("Your application is ready");
    expect(result.body).toBe("Review your generated materials and use the next step that fits this role.");
    expect(result.nextStepHint).toBe("Retry generation to complete your materials.");
  });

  it("returns READY for score >= 80 even when no artifacts exist", () => {
    const result = resolveWorkflowAuthority({
      score: 80,
      generationReadiness: readiness(),
      resumeState: { hasOutput: false, failed: false },
      coverState: { hasOutput: false, failed: false },
      isPro: false,
      hasGeneratedOnce: false,
      isHydrating: false,
    });

    expect(result.workflowState).toBe("READY");
    expect(result.canGenerate).toBe(true);
    expect(result.primaryAction).toBe("GENERATE");
    expect(result.headline).toBe("Your application is being prepared");
    expect(result.body).toBe("Your fit is strong enough to generate documents for this role.");
    expect(result.nextStepHint).toBe("Generate your documents to proceed.");
  });

  it("returns READY for score >= 80 even when readiness is blocked and no artifacts exist", () => {
    const result = resolveWorkflowAuthority({
      score: 92,
      generationReadiness: readiness({ blocked: true, status: "blocked" }),
      resumeState: { hasOutput: false, failed: false },
      coverState: { hasOutput: false, failed: false },
      isPro: true,
      hasGeneratedOnce: false,
      isHydrating: false,
    });

    expect(result.workflowState).toBe("READY");
    expect(result.canGenerate).toBe(true);
    expect(result.primaryAction).toBe("GENERATE");
    expect(result.headline).toBe("Your application is being prepared");
    expect(result.body).toBe("Your fit is strong enough to generate documents for this role.");
    expect(result.nextStepHint).toBe("Generate your documents to proceed.");
  });

  it("returns REVIEW_REQUIRED for low score when not blocked and no artifacts exist", () => {
    const result = resolveWorkflowAuthority({
      score: 60,
      generationReadiness: readiness(),
      resumeState: { hasOutput: false, failed: false },
      coverState: { hasOutput: false, failed: false },
      isPro: false,
      hasGeneratedOnce: false,
      isHydrating: false,
    });

    expect(result.workflowState).toBe("REVIEW_REQUIRED");
    expect(result.canGenerate).toBe(false);
    expect(result.suppressFailureMessaging).toBe(false);
    expect(result.primaryAction).toBe("REVIEW");
    expect(result.headline).toBe("Refine before you generate");
    expect(result.body).toBe("This role needs a tighter match before generation will be useful.");
    expect(result.nextStepHint).toBe("Review and refine your fit before continuing.");
  });

  it("returns READY + RETRY when score >= 80 but generation failed and no usable outputs exist", () => {
    const result = resolveWorkflowAuthority({
      score: 88,
      generationReadiness: readiness(),
      resumeState: { hasOutput: false, failed: true },
      coverState: { hasOutput: false, failed: false },
      isPro: true,
      hasGeneratedOnce: true,
      isHydrating: false,
    });

    expect(result.workflowState).toBe("READY");
    expect(result.primaryAction).toBe("RETRY");
    expect(result.nextStepHint).toBe("Retry generation to complete your materials.");
  });
});
