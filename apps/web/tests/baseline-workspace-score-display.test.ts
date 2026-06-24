import { describe, expect, it } from "vitest";

import { resolveTargetScoreDisplayValue } from "@/app/(app)/baseline/_components/WorkspaceRunner";

describe("resolveTargetScoreDisplayValue", () => {
  it("does not surface a fallback zero while a valid result is still loading", () => {
    expect(
      resolveTargetScoreDisplayValue({
        score: null,
        revealedScoreValue: 0,
        showResult: false,
      }),
    ).toBeNull();
  });

  it("shows the canonical nonzero score instead of a false zero", () => {
    expect(
      resolveTargetScoreDisplayValue({
        score: 91,
        revealedScoreValue: 0,
        showResult: true,
      }),
    ).toBe(91);
  });

  it("still shows a real zero score when the API score is truly zero", () => {
    expect(
      resolveTargetScoreDisplayValue({
        score: 0,
        revealedScoreValue: 17,
        showResult: true,
      }),
    ).toBe(0);
  });

  it("can show a positive reveal value during the animation", () => {
    expect(
      resolveTargetScoreDisplayValue({
        score: 91,
        revealedScoreValue: 17,
        showResult: true,
      }),
    ).toBe(17);
  });
});
