import { describe, expect, it } from "vitest";

import {
  buildGoldStandardCalibration,
  listGoldStandardBenchmarkFixtures,
} from "@/lib/goldStandardCalibration";
import {
  buildSupportOpsCalibrationPlan,
  buildWeakSupportOpsCoverLetter,
  buildWeakSupportOpsResume,
} from "./gold-standard-test-data";

describe("gold standard calibration", () => {
  it("returns structured calibration data and top gaps against the benchmark pair", () => {
    const plan = buildSupportOpsCalibrationPlan();
    const benchmark = listGoldStandardBenchmarkFixtures()[0];
    const calibration = buildGoldStandardCalibration({
      plan,
      generatedResume: buildWeakSupportOpsResume(),
      generatedCoverLetter: buildWeakSupportOpsCoverLetter(),
      benchmark,
    });

    expect(["aligned", "close", "off_target"]).toContain(calibration.overallCalibration);
    expect(calibration.dimensionScores).toMatchObject({
      framingAlignment: expect.any(Number),
      evidenceSelectionQuality: expect.any(Number),
      suppressionDiscipline: expect.any(Number),
      resumeClarity: expect.any(Number),
      coverLetterSpecificity: expect.any(Number),
      rolePriorityVisibility: expect.any(Number),
      languageSharpness: expect.any(Number),
      crossArtifactConsistency: expect.any(Number),
    });
    expect(calibration.topGaps.length).toBeGreaterThan(0);
    expect(calibration.benchmarkSummary.strongestBenchmarkTraits.length).toBeGreaterThan(0);
    expect(calibration.benchmarkSummary.missingInGeneratedOutput.length).toBeGreaterThan(0);
    expect(calibration.recommendedSystemAdjustments.length).toBeGreaterThan(0);
    expect(calibration.topGaps.some((gap) => gap.type === "cover_letter_too_generic")).toBe(true);
  });
});
