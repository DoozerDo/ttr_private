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

  it("returns the canonical score when the result is available", () => {
    expect(
      resolveTargetScoreDisplayValue({
        score: 91,
        revealedScoreValue: null,
        showResult: true,
      }),
    ).toBe(91);
  });
});
