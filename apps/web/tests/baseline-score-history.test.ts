import { describe, expect, it } from "vitest";

import {
  buildBaselineScoreHistoryFromBaseline,
  toBaselineScoreHistoryCardViewModel,
} from "@/lib/baselineScoreHistory";

describe("baseline score history", () => {
  it("sets original and current equally on first successful analysis", () => {
    const vm = toBaselineScoreHistoryCardViewModel(
      buildBaselineScoreHistoryFromBaseline({
        originalBaselineScore: 71,
        latestBaselineScore: 71,
      }),
    );
    expect(vm.hasSuccessfulAnalysis).toBe(true);
    expect(vm.originalScore).toBe(71);
    expect(vm.currentScore).toBe(71);
    expect(vm.scoreDelta).toBe(0);
    expect(vm.scoreDeltaDirection).toBe("flat");
  });

  it("keeps original score and updates current on later successful analyses", () => {
    const vm = toBaselineScoreHistoryCardViewModel(
      buildBaselineScoreHistoryFromBaseline({
        originalBaselineScore: 71,
        latestBaselineScore: 79,
      }),
    );
    expect(vm.originalScore).toBe(71);
    expect(vm.currentScore).toBe(79);
    expect(vm.scoreDelta).toBe(8);
    expect(vm.scoreDeltaDirection).toBe("up");
  });

  it("supports negative score deltas", () => {
    const vm = toBaselineScoreHistoryCardViewModel(
      buildBaselineScoreHistoryFromBaseline({
        originalBaselineScore: 79,
        latestBaselineScore: 74,
      }),
    );
    expect(vm.originalScore).toBe(79);
    expect(vm.currentScore).toBe(74);
    expect(vm.scoreDelta).toBe(-5);
    expect(vm.scoreDeltaDirection).toBe("down");
  });

  it("returns no score block view model when no successful analyses exist", () => {
    const vm = toBaselineScoreHistoryCardViewModel(
      buildBaselineScoreHistoryFromBaseline({
        originalBaselineScore: null,
        latestBaselineScore: null,
      }),
    );
    expect(vm.hasSuccessfulAnalysis).toBe(false);
    expect(vm.originalScore).toBeNull();
    expect(vm.currentScore).toBeNull();
  });
});
