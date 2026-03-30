import { describe, expect, it } from "vitest";

import { getCanonicalNextAction } from "@/lib/nextAction";

describe("getCanonicalNextAction", () => {
  it("routes to fit review below 70", () => {
    const action = getCanonicalNextAction({
      fitScore: 62,
      generationReady: true,
      trustGateAllowed: true,
    });
    expect(action.type).toBe("fit_review");
  });

  it("routes to fit review when readiness is not ready", () => {
    const action = getCanonicalNextAction({
      fitScore: 76,
      generationReady: false,
      trustGateAllowed: true,
    });
    expect(action.type).toBe("fit_review");
    expect(action.reason).toContain("readiness not ready");
  });

  it("routes to studio for 70 to 84 when ready", () => {
    const action = getCanonicalNextAction({
      fitScore: 76,
      generationReady: true,
      trustGateAllowed: true,
    });
    expect(action.type).toBe("studio");
  });

  it("routes to studio_with_save for 85+ when ready", () => {
    const action = getCanonicalNextAction({
      fitScore: 90,
      generationReady: true,
      trustGateAllowed: true,
    });
    expect(action.type).toBe("studio_with_save");
  });
});
