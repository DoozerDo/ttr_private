import { renderHook } from "@testing-library/react";

import { deriveGuidedStepFromNextAction, useGuidedMode } from "@/hooks/useGuidedMode";

describe("guided mode", () => {
  it("maps fit review next action to resolve gaps", () => {
    expect(deriveGuidedStepFromNextAction("fit_review")).toBe("RESOLVE_GAPS");
  });

  it("maps studio next action to generate", () => {
    expect(deriveGuidedStepFromNextAction("studio")).toBe("GENERATE");
  });

  it("maps studio with save next action to generate", () => {
    expect(deriveGuidedStepFromNextAction("studio_with_save")).toBe("GENERATE");
  });

  it("maps unknown next action to complete", () => {
    expect(deriveGuidedStepFromNextAction("unknown_action" as any)).toBe("COMPLETE");
  });

  it("exposes guided api surface", () => {
    const { result } = renderHook(() => useGuidedMode());
    expect(typeof result.current.isGuidedActive).toBe("boolean");
    expect(typeof result.current.advanceStep).toBe("function");
    expect(typeof result.current.completeGuidedMode).toBe("function");
  });
});
