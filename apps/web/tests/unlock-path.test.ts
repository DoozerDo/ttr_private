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
