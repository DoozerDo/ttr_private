export enum BaselineReadinessLevel {
  INGESTED = "INGESTED",
  USABLE = "USABLE",
  STRONG = "STRONG",
  OPTIMIZED = "OPTIMIZED",
}

export interface BaselineStrength {
  percent: number;
  readiness: BaselineReadinessLevel;
}
