import { describe, expect, it } from "vitest";

import { BaselineReadinessLevel } from "@/src/features/baseline/types";
import {
  buildBaselineStrength,
  calculateBaselineReadiness,
} from "@/src/features/baseline/utils/baselineStrength";

describe("baseline readiness model", () => {
  it("maps percent ranges to readiness levels", () => {
    expect(calculateBaselineReadiness(20)).toBe(BaselineReadinessLevel.INGESTED);
    expect(calculateBaselineReadiness(50)).toBe(BaselineReadinessLevel.USABLE);
    expect(calculateBaselineReadiness(82)).toBe(BaselineReadinessLevel.STRONG);
    expect(calculateBaselineReadiness(95)).toBe(BaselineReadinessLevel.OPTIMIZED);
  });

  it("builds baseline strength with percent and readiness", () => {
    expect(buildBaselineStrength(82)).toEqual({
      percent: 82,
      readiness: BaselineReadinessLevel.STRONG,
    });
  });
});
