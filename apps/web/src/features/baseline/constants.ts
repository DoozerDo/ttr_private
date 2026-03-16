import { BaselineReadinessLevel } from "./types";

export const BASELINE_USABLE_MIN_PERCENT = 41;
export const BETA_BASELINE_UPLOAD_LIMIT = 3;

export const BASELINE_READINESS_LABELS: Record<BaselineReadinessLevel, string> = {
  [BaselineReadinessLevel.INGESTED]: "Baseline imported",
  [BaselineReadinessLevel.USABLE]: "Baseline usable for scoring",
  [BaselineReadinessLevel.STRONG]: "Strong baseline",
  [BaselineReadinessLevel.OPTIMIZED]: "Optimized baseline",
};

export const BASELINE_MILESTONES = [
  { value: 28, valueLabel: "28%", label: "Resume ingested" },
  { value: 45, valueLabel: "45%", label: "Career history confirmed" },
  { value: 65, valueLabel: "65%", label: "Leadership scope clarified" },
  { value: 82, valueLabel: "82%", label: "Systems and operational context added" },
  { value: 90, valueLabel: "90-100%", label: "Baseline optimized" },
] as const;
