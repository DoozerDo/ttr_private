import { renderHook } from "@testing-library/react";

import { deriveGuidedStepFromNextAction, useGuidedMode } from "@/hooks/useGuidedMode";

describe("guided mode", () => {
  it("maps continue-analysis state", () => {
    expect(deriveGuidedStepFromNextAction("CONTINUE_ANALYSIS")).toBe("ANALYZE");
  });

  it("maps weak-fit path to resolve gaps", () => {
    expect(deriveGuidedStepFromNextAction("RESOLVE_GAPS")).toBe("RESOLVE_GAPS");
  });

  it("maps reanalyze path", () => {
    expect(deriveGuidedStepFromNextAction("REANALYZE")).toBe("REANALYZE");
  });

  it("maps generation-ready path", () => {
    expect(deriveGuidedStepFromNextAction("GENERATE_RESUME")).toBe("GENERATE");
  });

  it("maps post-generation save path", () => {
    expect(deriveGuidedStepFromNextAction("ADD_TO_OPPORTUNITIES")).toBe("GENERATE");
  });

  it("maps completed path", () => {
    expect(deriveGuidedStepFromNextAction("REVIEW_RESULTS")).toBe("COMPLETE");
  });

  it("exposes guided api surface", () => {
    const { result } = renderHook(() => useGuidedMode());
    expect(typeof result.current.isGuidedActive).toBe("boolean");
    expect(typeof result.current.advanceStep).toBe("function");
    expect(typeof result.current.completeGuidedMode).toBe("function");
  });
});
