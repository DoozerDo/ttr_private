import { resolveUnlockPathState } from "@/src/lib/unlockPath";

describe("unlock path state", () => {
  it("locks analysis until baseline is ready", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/baseline",
      baselineReady: false,
      analysisExists: false,
      score: null,
      readinessStatus: null,
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
      hasGeneratedDocuments: false,
      hasSavedOpportunity: false,
    });

    expect(state.analysis).toBe("CURRENT");
    expect(state.fitReview).toBe("CURRENT");
    expect(state.studio).toBe("LOCKED");
  });

  it("keeps fit review locked when no active baseline exists", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/baseline",
      baselineReady: false,
      analysisExists: false,
      score: null,
      readinessStatus: null,
      hasGeneratedDocuments: false,
      hasSavedOpportunity: false,
    });

    expect(state.baseline).toBe("CURRENT");
    expect(state.fitReview).toBe("LOCKED");
  });

  it("routes score 76 with unready generation to fit review current and studio locked", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/results",
      baselineReady: true,
      analysisExists: true,
      score: 76,
      readinessStatus: "limited",
      hasGeneratedDocuments: false,
      hasSavedOpportunity: false,
    });

    expect(state.fitReview).toBe("CURRENT");
    expect(state.studio).toBe("LOCKED");
  });

  it("shows studio current when readiness is ready", () => {
    const state = resolveUnlockPathState({
      currentPathname: "/studio",
      baselineReady: true,
      analysisExists: true,
      score: 76,
      readinessStatus: "ready",
      hasGeneratedDocuments: false,
      hasSavedOpportunity: false,
    });

    expect(state.studio).toBe("CURRENT");
    expect(state.fitReview).toBe("COMPLETE");
  });
});
