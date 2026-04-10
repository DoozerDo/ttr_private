import { describe, expect, it } from "vitest";

import { REFINEMENT_PRESETS, buildDocumentStrategyPlan } from "@shared/documentStrategyPlan";

function buildBaseInput() {
  return {
    fitScore: 84,
    jobTitle: "Director of Support",
    jobCompany: "Acme",
    jobDescription:
      "Lead support operations, workflow design, and cross-functional coordination for a SaaS platform with high volume service delivery.",
    jobRequirements: [
      "Own process and workflow improvements.",
      "Partner with product and engineering.",
    ],
    analysisSummary: "Strong fit for support operations leadership.",
    baselineSections: [
      {
        id: "section-1",
        title: "Support Operations",
        sectionType: "EXPERIENCE",
        content:
          "Led support operations programs, improved workflows, and partnered with product and engineering on service delivery.",
      },
      {
        id: "section-2",
        title: "People Leadership",
        sectionType: "EXPERIENCE",
        content: "Managed a team of 12 and hired new support managers.",
      },
    ],
  };
}

describe("refinement plan application", () => {
  it("produces a refined plan without mutating the original strategy", () => {
    const baseInput = buildBaseInput();
    const basePlan = buildDocumentStrategyPlan(baseInput);
    const summaryRefinement = REFINEMENT_PRESETS.find((preset) => preset.key === "tighten-summary");
    expect(summaryRefinement).toBeTruthy();

    const refinedPlan = buildDocumentStrategyPlan({
      ...baseInput,
      refinements: [summaryRefinement!],
    });

    expect(basePlan.summaryStrategy).not.toEqual(refinedPlan.summaryStrategy);
    expect(basePlan.positioningFrame).toBe(refinedPlan.positioningFrame);
    expect(basePlan.selectedEvidence).toHaveLength(refinedPlan.selectedEvidence.length);
    expect(basePlan.coverLetterThemes).toEqual(buildDocumentStrategyPlan(baseInput).coverLetterThemes);
    expect(refinedPlan.qualityPass.mustLeadWith.length).toBeGreaterThan(0);
    expect(refinedPlan.documentQualityScore).toBeGreaterThanOrEqual(basePlan.documentQualityScore - 5);
  });
});

