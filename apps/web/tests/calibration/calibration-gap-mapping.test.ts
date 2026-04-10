import { describe, expect, it } from "vitest";

import {
  buildGoldStandardCalibration,
  buildGoldStandardCalibrationReport,
  listGoldStandardBenchmarkFixtures,
  mapGoldStandardCalibrationGapToSubsystems,
} from "@shared/goldStandardCalibration";
import {
  buildSupportOpsCalibrationPlan,
  buildWeakSupportOpsCoverLetter,
  buildWeakSupportOpsResume,
} from "./gold-standard-test-data";

describe("calibration gap mapping", () => {
  it("maps observed weaknesses to likely subsystem causes", () => {
    const plan = buildSupportOpsCalibrationPlan();
    const benchmark = listGoldStandardBenchmarkFixtures()[0];
    const calibration = buildGoldStandardCalibration({
      plan,
      generatedResume: buildWeakSupportOpsResume(),
      generatedCoverLetter: buildWeakSupportOpsCoverLetter(),
      benchmark,
    });
    const report = buildGoldStandardCalibrationReport(calibration, benchmark);

    expect(report.likelySubsystemCauses).toEqual(
      expect.arrayContaining(["RoleMatchFinalPass", "LanguageStylePass"]),
    );
    expect(mapGoldStandardCalibrationGapToSubsystems("evidence_too_diffuse")).toEqual(
      expect.arrayContaining(["DocumentStrategyPlan selected evidence ranking"]),
    );
    expect(mapGoldStandardCalibrationGapToSubsystems("cover_letter_too_generic")).toEqual(
      expect.arrayContaining(["RoleMatchFinalPass", "LanguageStylePass"]),
    );
  });
});

