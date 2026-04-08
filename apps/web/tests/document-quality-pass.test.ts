import { describe, expect, it } from "vitest";

import { buildDocumentStrategyPlan } from "@/lib/documentStrategyPlan";

describe("document quality pass", () => {
  it("tightens a weak plan into a single dominant frame with clear suppression guidance", () => {
    const plan = buildDocumentStrategyPlan({
      fitScore: 72,
      jobTitle: "Support Operations Manager",
      jobCompany: "Acme",
      jobDescription:
        "Own customer support operations, process design, and escalation handling in a SaaS environment.",
      jobRequirements: ["Lead support operations", "Partner cross-functionally"],
      baselineSections: [
        {
          id: "section-1",
          title: "Support Operations",
          sectionType: "EXPERIENCE",
          content:
            "Led support operations programs, improved workflows, and partnered with engineering on service delivery.",
        },
        {
          id: "section-2",
          title: "Education",
          sectionType: "EDUCATION",
          content: "State University, BA",
        },
      ],
    });

    expect(plan.positioningFrame).toBe("Customer Operations and Support Strategy leader");
    expect(plan.qualityPass.framingStrength).toBe("medium");
    expect(plan.qualityPass.emphasisConfidence).toBe("medium");
    expect(plan.qualityPass.topNarrativeAxes.length).toBeGreaterThan(0);
    expect(plan.qualityPass.cutCandidates.length).toBeGreaterThan(0);
    expect(plan.qualityPass.mustLeadWith[0]).toBe(plan.positioningFrame);
    expect(plan.qualityPass.coverLetterDelta.length).toBeGreaterThan(0);
    expect(plan.documentQualityScore).toBeGreaterThan(0);
  });
});
