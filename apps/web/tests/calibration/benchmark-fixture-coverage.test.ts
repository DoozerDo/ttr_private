import { describe, expect, it } from "vitest";

import {
  getGoldStandardBenchmarkFixture,
  listGoldStandardBenchmarkFixtures,
} from "@/lib/goldStandardCalibration";

describe("benchmark fixture coverage", () => {
  it("loads approved benchmark fixtures with all required fields", () => {
    const fixtures = listGoldStandardBenchmarkFixtures();

    expect(fixtures.length).toBeGreaterThanOrEqual(2);
    for (const fixture of fixtures) {
      expect(fixture.fixtureId).toBeTruthy();
      expect(fixture.baselineId).toBeTruthy();
      expect(fixture.jobId).toBeTruthy();
      expect(fixture.scenarioName).toBeTruthy();
      expect(fixture.benchmarkPositioningFrame).toBeTruthy();
      expect(fixture.approvedBenchmarkResume.summary).toBeTruthy();
      expect(fixture.approvedBenchmarkResume.bullets.length).toBeGreaterThan(0);
      expect(fixture.approvedBenchmarkCoverLetter.opening).toBeTruthy();
      expect(fixture.approvedBenchmarkCoverLetter.bodyParagraphs.length).toBeGreaterThan(0);
      expect(fixture.approvedBenchmarkCoverLetter.closingParagraph).toBeTruthy();
      expect(getGoldStandardBenchmarkFixture(fixture.fixtureId)).toMatchObject({
        fixtureId: fixture.fixtureId,
      });
    }
  });
});
