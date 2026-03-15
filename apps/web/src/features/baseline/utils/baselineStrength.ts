import { BaselineReadinessLevel, type BaselineStrength } from "../types";

export function calculateBaselineReadiness(percent: number): BaselineReadinessLevel {
  if (percent <= 40) return BaselineReadinessLevel.INGESTED;
  if (percent <= 70) return BaselineReadinessLevel.USABLE;
  if (percent <= 89) return BaselineReadinessLevel.STRONG;
  return BaselineReadinessLevel.OPTIMIZED;
}

export function buildBaselineStrength(percent: number): BaselineStrength {
  return {
    percent,
    readiness: calculateBaselineReadiness(percent),
  };
}
