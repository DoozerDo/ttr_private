import { resolveUnlockPathState } from "@/src/lib/unlockPath";

describe("unlock path state", () => {
  it("locks analysis until baseline is ready", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/baseline",
      baselineReady: false,
      analysisExists: false,
      score: null,
      readinessStatus: null,
      readinessReasonCodes: null,
      hasGeneratedDocuments: false,
      hasSavedOpportunity: false,
    });

    expect(state.analysis).toBe("LOCKED");
    expect(state.fitReview).toBe("LOCKED");
    expect(state.studio).toBe("LOCKED");
    expect(state.opportunities).toBe("LOCKED");
  });

  it("marks targeting as current on the target route and keeps baseline out of the current step", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/target",
      baselineReady: true,
      analysisExists: false,
      score: null,
      readinessStatus: null,
      readinessReasonCodes: null,
      hasGeneratedDocuments: false,
      hasSavedOpportunity: false,
    });

    expect(state.baseline).toBe("COMPLETE");
    expect(state.analysis).toBe("CURRENT");
    expect(state.fitReview).toBe("LOCKED");
    expect(state.studio).toBe("LOCKED");
  });

  it("keeps TARGET current even when the baseline is missing", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/target",
      baselineReady: false,
      analysisExists: false,
      score: null,
      readinessStatus: null,
      readinessReasonCodes: null,
      hasGeneratedDocuments: false,
      hasSavedOpportunity: false,
    });

    expect(state.analysis).toBe("CURRENT");
    expect(state.baseline).toBe("LOCKED");
    expect(state.fitReview).toBe("LOCKED");
    expect(state.studio).toBe("LOCKED");
  });

  it("keeps the target stage label distinct from analysis in the rail contract", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/target",
      baselineReady: true,
      analysisExists: true,
      score: 84,
      readinessStatus: "limited",
      readinessReasonCodes: null,
      hasGeneratedDocuments: false,
      hasSavedOpportunity: false,
    });

    expect(state.analysis).toBe("CURRENT");
    expect(state.fitReview).toBe("UNLOCKED");
    expect(state.studio).toBe("UNLOCKED");
  });

  it("keeps fit review locked when no active baseline exists", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/baseline",
      baselineReady: false,
      analysisExists: false,
      score: null,
      readinessStatus: null,
      readinessReasonCodes: null,
      hasGeneratedDocuments: false,
      hasSavedOpportunity: false,
    });

    expect(state.baseline).toBe("CURRENT");
    expect(state.fitReview).toBe("LOCKED");
  });

  it("keeps Studio locked below the 80 score floor even when readiness is limited", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/results",
      baselineReady: true,
      analysisExists: true,
      score: 76,
      readinessStatus: "limited",
      readinessReasonCodes: null,
      hasGeneratedDocuments: false,
      hasSavedOpportunity: false,
    });

    expect(state.fitReview).toBe("UNLOCKED");
    expect(state.studio).toBe("LOCKED");
  });

  it("score 83 + usable baseline resolves Studio CURRENT and enables progression", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/studio",
      baselineReady: true,
      analysisExists: true,
      score: 83,
      readinessStatus: "ready",
      readinessReasonCodes: [],
      hasGeneratedDocuments: false,
      hasSavedOpportunity: false,
    });

    expect(state.studio).toBe("CURRENT");
    expect(state.fitReview).toBe("COMPLETE");
  });

  it("score 83 + baseline repair required must never mark Studio CURRENT (dominant baseline blocker)", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/studio",
      baselineReady: true,
      analysisExists: true,
      score: 83,
      readinessStatus: "blocked",
      readinessReasonCodes: ["baseline_resume_v2_missing"],
      hasGeneratedDocuments: false,
      hasSavedOpportunity: false,
    });

    expect(state.studio).toBe("LOCKED");
    expect(state.baseline).toBe("CURRENT");
  });

  it("score 79 + usable baseline keeps Studio locked", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/results",
      baselineReady: true,
      analysisExists: true,
      score: 79,
      readinessStatus: "ready",
      readinessReasonCodes: [],
      hasGeneratedDocuments: false,
      hasSavedOpportunity: false,
    });

    expect(state.studio).toBe("LOCKED");
  });

  it("shows opportunities current on the opportunities route", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/opportunities",
      baselineReady: true,
      analysisExists: true,
      score: 84,
      readinessStatus: "ready",
      readinessReasonCodes: null,
      hasGeneratedDocuments: true,
      hasSavedOpportunity: false,
    });

    expect(state.opportunities).toBe("CURRENT");
    expect(state.studio).toBe("COMPLETE");
  });
});
