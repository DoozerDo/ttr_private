import { describe, expect, it } from "vitest";

import {
  GOLD_STANDARD_BENCHMARK_FIXTURES,
  buildGoldStandardCalibration,
  meetsGoldStandardCalibrationMinimumBar,
} from "@/lib/goldStandardCalibration";
import { buildSupportOpsCalibrationPlan } from "./gold-standard-test-data";

describe("calibration regression", () => {
  it("keeps an approved benchmark pair above the minimum calibration bar", () => {
    const plan = buildSupportOpsCalibrationPlan();
    const benchmark = GOLD_STANDARD_BENCHMARK_FIXTURES[0];
    const calibration = buildGoldStandardCalibration({
      plan,
      generatedResume: benchmark.approvedBenchmarkResume,
      generatedCoverLetter: benchmark.approvedBenchmarkCoverLetter,
      benchmark,
    });

    expect(calibration.overallCalibration).toBe("aligned");
    expect(meetsGoldStandardCalibrationMinimumBar(calibration)).toBe(true);
    expect(Math.min(...Object.values(calibration.dimensionScores))).toBeGreaterThanOrEqual(72);
    expect(calibration.topGaps.filter((gap) => gap.severity === "high")).toHaveLength(0);
  });
});
