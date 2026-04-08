import { describe, expect, it } from "vitest";

import { buildCalibrationFeedback } from "@/lib/calibrationFeedback";
import { buildGoldStandardCalibration, listGoldStandardBenchmarkFixtures } from "@/lib/goldStandardCalibration";
import { buildSupportOpsCalibrationPlan, buildWeakSupportOpsCoverLetter, buildWeakSupportOpsResume } from "./gold-standard-test-data";

describe("calibration feedback mapping", () => {
  it("maps calibration gaps into deterministic system adjustments", () => {
    const plan = buildSupportOpsCalibrationPlan();
    const benchmark = listGoldStandardBenchmarkFixtures()[0];
    const calibration = buildGoldStandardCalibration({
      plan,
      generatedResume: buildWeakSupportOpsResume(),
      generatedCoverLetter: buildWeakSupportOpsCoverLetter(),
      benchmark,
    });
    const feedback = buildCalibrationFeedback({ calibration, plan });

    expect(feedback.adjustments.length).toBeGreaterThan(0);
    expect(feedback.adjustments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetSubsystem: "strategy_plan",
          action: expect.stringMatching(/promote|suppress|increase_weight/),
        }),
        expect.objectContaining({
          targetSubsystem: "language_style",
          action: "tighten_language",
        }),
      ]),
    );
  });
});
