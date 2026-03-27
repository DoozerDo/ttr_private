import { describe, expect, it } from "vitest";

import { deriveOpportunityDrift } from "@/lib/opportunityDrift";

describe("deriveOpportunityDrift", () => {
  it("returns IMPROVED when current fit is higher", () => {
    const result = deriveOpportunityDrift({
      savedFitScore: 68,
      currentFitScore: 81,
      generationAllowed: true,
    });
    expect(result.driftStatus).toBe("IMPROVED");
    expect(result.fitDelta).toBe(13);
    expect(result.shouldShowUpdateMaterials).toBe(true);
  });

  it("returns DECLINED when current fit is lower", () => {
    const result = deriveOpportunityDrift({
      savedFitScore: 81,
      currentFitScore: 72,
      generationAllowed: true,
    });
    expect(result.driftStatus).toBe("DECLINED");
    expect(result.fitDelta).toBe(-9);
    expect(result.shouldShowUpdateMaterials).toBe(false);
  });

  it("returns UNCHANGED when scores match", () => {
    const result = deriveOpportunityDrift({
      savedFitScore: 74,
      currentFitScore: 74,
      generationAllowed: true,
    });
    expect(result.driftStatus).toBe("UNCHANGED");
    expect(result.fitDelta).toBe(0);
  });

  it("returns UNKNOWN when current fit is unavailable", () => {
    const result = deriveOpportunityDrift({
      savedFitScore: 74,
      currentFitScore: null,
      generationAllowed: true,
    });
    expect(result.driftStatus).toBe("UNKNOWN");
    expect(result.fitDelta).toBeNull();
    expect(result.shouldShowUpdateMaterials).toBe(false);
  });
});
