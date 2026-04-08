import { describe, expect, it } from "vitest";

import {
  REFINEMENT_PRESETS,
  resolveRefinementTargets,
} from "@/lib/documentStrategyPlan";

describe("refinement instructions", () => {
  it("maps presets to deterministic targets and constraints", () => {
    const leadership = REFINEMENT_PRESETS.find((preset) => preset.key === "emphasize-leadership");
    const coverFit = REFINEMENT_PRESETS.find((preset) => preset.key === "cover-role-fit");
    const evidenceSwap = REFINEMENT_PRESETS.find((preset) => preset.key === "evidence-swap");

    expect(leadership).toBeTruthy();
    expect(leadership?.type).toBe("emphasis_shift");
    expect(leadership?.constraints.preservePositioningFrame).toBe(true);
    expect(leadership?.constraints.preserveSelectedEvidence).toBe(true);
    expect(resolveRefinementTargets(leadership!)).toEqual(["resume", "cover_letter"]);

    expect(coverFit?.target).toBe("cover_letter");
    expect(resolveRefinementTargets(coverFit!)).toEqual(["cover_letter"]);

    expect(evidenceSwap?.constraints.allowNewEvidenceFromBaseline).toBe(true);
    expect(evidenceSwap?.constraints.preserveSelectedEvidence).toBe(false);
    expect(resolveRefinementTargets(evidenceSwap!)).toEqual(["resume"]);
  });
});
