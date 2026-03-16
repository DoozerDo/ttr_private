import { describe, expect, it } from "vitest";

import { getJourneyStepIconKey } from "@/src/components/layout/JourneyNavV1";
import { JOURNEY_NAV_STEPS, getStepIdForPathname } from "@/src/lib/journeyNav";
import { routeLookup } from "@/src/navigation/routes";

describe("journey nav configuration", () => {
  it("matches the locked step order and labels", () => {
    expect(JOURNEY_NAV_STEPS.map((step) => step.label)).toEqual([
      "BASELINE STUDIO",
      "TARGET",
      "SCORE",
      "DOCUMENT GENERATOR",
      "OPPORTUNITIES",
      "INTERVIEW TOOLKIT",
    ]);
  });

  it("uses DOCUMENT GENERATOR label for the studio step", () => {
    expect(routeLookup.get("studio")?.label).toBe("DOCUMENT GENERATOR");
  });

  it("uses distinct icons for baseline studio and target", () => {
    expect(getJourneyStepIconKey("baselines")).toBe("baseline-workbench");
    expect(getJourneyStepIconKey("target")).toBe("target-crosshair");
    expect(getJourneyStepIconKey("baselines")).not.toBe(getJourneyStepIconKey("target"));
  });

  it("resolves route highlighting for baseline, target, score and document generator paths", () => {
    expect(getStepIdForPathname("/baseline")).toBe("baselines");
    expect(getStepIdForPathname("/target")).toBe("target");
    expect(getStepIdForPathname("/score")).toBe("results");
    expect(getStepIdForPathname("/document-generator")).toBe("studio");
  });
});
