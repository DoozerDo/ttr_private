import { describe, expect, it } from "vitest";

import { deriveBaselineLoopState } from "@/lib/baselineLoopState";
import type { BaselineDto } from "@/lib/baselines";

const base = (overrides: Partial<BaselineDto> = {}): BaselineDto =>
  ({
    id: "base-1",
    userId: "user-1",
    version: 1,
    originalFilename: "resume.pdf",
    mimeType: "application/pdf",
    storagePath: "/tmp/base-1",
    hash: null,
    status: "ACTIVE",
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }) as BaselineDto;

describe("baseline loop state", () => {
  it("treats a qualifying active baseline as analyzed, validated, and ready for job description entry", () => {
    const state = deriveBaselineLoopState([
      base({
        latestBaselineScore: 84,
        latestAssessmentSummary: {
          latestAssessmentId: "assessment-1",
          latestAssessmentCreatedAt: "2026-03-01T00:00:00.000Z",
          latestFitScore: 84,
          hasCompletedAssessment: true,
        },
      }),
    ]);

    expect(state.hasActiveBaseline).toBe(true);
    expect(state.isArchived).toBe(false);
    expect(state.isAnalyzed).toBe(true);
    expect(state.effectivenessScore).toBe(84);
    expect(state.isValidated).toBe(true);
    expect(state.nextStep).toBe("ADD_JOB_DESCRIPTION");
  });

  it("keeps an analyzed but subthreshold baseline on the improvement path", () => {
    const state = deriveBaselineLoopState([
      base({
        latestBaselineScore: 72,
        latestAssessmentSummary: {
          latestAssessmentId: "assessment-1",
          latestAssessmentCreatedAt: "2026-03-01T00:00:00.000Z",
          latestFitScore: 72,
          hasCompletedAssessment: true,
        },
      }),
    ]);

    expect(state.isAnalyzed).toBe(true);
    expect(state.isValidated).toBe(false);
    expect(state.nextStep).toBe("IMPROVE_BASELINE");
  });

  it("ignores archived baselines when deriving the active loop state", () => {
    const state = deriveBaselineLoopState([
      base({
        id: "archived-base",
        status: "ARCHIVED",
        archivedAt: "2026-03-01T00:00:00.000Z",
        latestBaselineScore: 92,
        latestAssessmentSummary: {
          latestAssessmentId: "assessment-archived",
          latestAssessmentCreatedAt: "2026-03-01T00:00:00.000Z",
          latestFitScore: 92,
          hasCompletedAssessment: true,
        },
      }),
    ]);

    expect(state.hasActiveBaseline).toBe(false);
    expect(state.isArchived).toBe(false);
    expect(state.nextStep).toBe("UPLOAD_RESUME");
  });

  it("does not confuse not analyzed with needs improvement", () => {
    const state = deriveBaselineLoopState([
      base({
        latestBaselineScore: null,
        latestAssessmentSummary: null,
      }),
    ]);

    expect(state.isAnalyzed).toBe(false);
    expect(state.isValidated).toBe(false);
    expect(state.nextStep).toBe("ANALYZE_ROLE");
  });
});
