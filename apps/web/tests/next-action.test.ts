import { describe, expect, it } from "vitest";

import { derivePrimaryNextAction } from "@/lib/nextAction";

describe("derivePrimaryNextAction", () => {
  it("returns Continue Analysis when no analysis is present", () => {
    const action = derivePrimaryNextAction({
      analysisPresent: false,
      fitScore: null,
      reanalysisNeeded: false,
      hasCompletedGeneration: false,
      opportunityAlreadySaved: false,
    });
    expect(action.action).toBe("CONTINUE_ANALYSIS");
  });

  it("returns Resolve Gaps when fit score is below 70", () => {
    const action = derivePrimaryNextAction({
      analysisPresent: true,
      fitScore: 62,
      reanalysisNeeded: false,
      hasCompletedGeneration: false,
      opportunityAlreadySaved: false,
    });
    expect(action.action).toBe("RESOLVE_GAPS");
  });

  it("returns Reanalyze when reanalysis is explicitly needed", () => {
    const action = derivePrimaryNextAction({
      analysisPresent: true,
      fitScore: 62,
      reanalysisNeeded: true,
      hasCompletedGeneration: false,
      opportunityAlreadySaved: false,
    });
    expect(action.action).toBe("REANALYZE");
  });

  it("returns Generate Resume when fit is 70+ and generation is not complete", () => {
    const action = derivePrimaryNextAction({
      analysisPresent: true,
      fitScore: 74,
      reanalysisNeeded: false,
      hasCompletedGeneration: false,
      opportunityAlreadySaved: false,
    });
    expect(action.action).toBe("GENERATE_RESUME");
  });

  it("returns Add to Opportunities when generation is complete and opportunity is not saved", () => {
    const action = derivePrimaryNextAction({
      analysisPresent: true,
      fitScore: 82,
      reanalysisNeeded: false,
      hasCompletedGeneration: true,
      opportunityAlreadySaved: false,
    });
    expect(action.action).toBe("ADD_TO_OPPORTUNITIES");
  });

  it("returns Review Results when opportunity is already saved", () => {
    const action = derivePrimaryNextAction({
      analysisPresent: true,
      fitScore: 82,
      reanalysisNeeded: false,
      hasCompletedGeneration: true,
      opportunityAlreadySaved: true,
    });
    expect(action.action).toBe("REVIEW_RESULTS");
  });
});
