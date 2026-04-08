import { describe, expect, it } from "vitest";

import { REFINEMENT_PRESETS, buildDocumentStrategyPlan } from "@/lib/documentStrategyPlan";

const GENERIC_FILLER = [
  "results-driven",
  "proven track record",
  "dynamic leader",
  "passionate",
  "self-starter",
];

describe("refinement quality guard", () => {
  it("keeps the refined plan strategic without generic filler", () => {
    const plan = buildDocumentStrategyPlan({
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
      refinements: [REFINEMENT_PRESETS.find((preset) => preset.key === "more-strategic")!],
    });

    const summary = plan.summaryStrategy.toLowerCase();
    expect(plan.qualityPass.framingStrength).not.toBe("low");
    expect(["medium", "high"]).toContain(plan.qualityPass.emphasisConfidence);
    expect(plan.positioningFrame).toBe("Service delivery and incident operations leader");
    expect(GENERIC_FILLER.some((phrase) => summary.includes(phrase))).toBe(false);
    expect(plan.qualityPass.coverLetterDelta.length).toBeGreaterThan(0);
  });
});
