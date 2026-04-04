import { describe, expect, it } from "vitest";

import { getScoreBand, ScoreBand } from "@/src/lib/score-band";

describe("score band utility", () => {
  it("classifies top band", () => {
    expect(getScoreBand(94)).toBe(ScoreBand.TOP);
    expect(getScoreBand(90)).toBe(ScoreBand.TOP);
  });

  it("classifies mid band", () => {
    expect(getScoreBand(89.9)).toBe(ScoreBand.MID);
    expect(getScoreBand(70)).toBe(ScoreBand.MID);
  });

  it("classifies low band", () => {
    expect(getScoreBand(69.9)).toBe(ScoreBand.LOW);
    expect(getScoreBand(40)).toBe(ScoreBand.LOW);
  });
});

