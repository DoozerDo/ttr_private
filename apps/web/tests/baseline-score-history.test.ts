import { describe, expect, it } from "vitest";

import {
  buildBaselineScoreHistoryMap,
  toBaselineScoreHistoryCardViewModel,
} from "@/lib/baselineScoreHistory";

describe("baseline score history", () => {
  it("sets original and current equally on first successful analysis", () => {
    const map = buildBaselineScoreHistoryMap([
      {
        baselineId: "base-1",
        status: "completed",
        score: 71,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const vm = toBaselineScoreHistoryCardViewModel(map["base-1"]);
    expect(vm.hasSuccessfulAnalysis).toBe(true);
    expect(vm.originalScore).toBe(71);
    expect(vm.currentScore).toBe(71);
    expect(vm.scoreDelta).toBe(0);
    expect(vm.scoreDeltaDirection).toBe("flat");
  });

  it("keeps original score and updates current on later successful analyses", () => {
    const map = buildBaselineScoreHistoryMap([
      {
        baselineId: "base-1",
        status: "completed",
        score: 71,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        baselineId: "base-1",
        status: "completed",
        score: 79,
        createdAt: "2026-01-03T00:00:00.000Z",
      },
    ]);

    const vm = toBaselineScoreHistoryCardViewModel(map["base-1"]);
    expect(vm.originalScore).toBe(71);
    expect(vm.currentScore).toBe(79);
    expect(vm.scoreDelta).toBe(8);
    expect(vm.scoreDeltaDirection).toBe("up");
  });

  it("does not let failed analyses overwrite score history", () => {
    const map = buildBaselineScoreHistoryMap([
      {
        baselineId: "base-1",
        status: "completed",
        score: 79,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        baselineId: "base-1",
        status: "failed",
        score: 40,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        baselineId: "base-1",
        status: "completed",
        score: 74,
        createdAt: "2026-01-03T00:00:00.000Z",
      },
    ]);

    const vm = toBaselineScoreHistoryCardViewModel(map["base-1"]);
    expect(vm.originalScore).toBe(79);
    expect(vm.currentScore).toBe(74);
    expect(vm.scoreDelta).toBe(-5);
    expect(vm.scoreDeltaDirection).toBe("down");
  });

  it("returns no score block view model when no successful analyses exist", () => {
    const map = buildBaselineScoreHistoryMap([
      {
        baselineId: "base-1",
        status: "failed",
        score: 50,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const vm = toBaselineScoreHistoryCardViewModel(map["base-1"]);
    expect(vm.hasSuccessfulAnalysis).toBe(false);
    expect(vm.originalScore).toBeNull();
    expect(vm.currentScore).toBeNull();
  });
});
