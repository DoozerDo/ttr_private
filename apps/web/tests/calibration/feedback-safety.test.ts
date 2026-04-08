import { describe, expect, it } from "vitest";

import { runGoldStandardSelfImprovementCycle } from "@/lib/selfImprovementLoop";
import { GOLD_STANDARD_BENCHMARK_FIXTURES } from "@/lib/goldStandardCalibration";

describe("feedback safety", () => {
  it("preserves baseline truth and does not invent new claims", () => {
    const benchmark = GOLD_STANDARD_BENCHMARK_FIXTURES[0];
    const baselineSections = [
      {
        id: "section-1",
        title: "Support Operations",
        sectionType: "EXPERIENCE",
        content:
          "Led support operations, reduced response time by 24%, and improved SLA adherence across a multi-channel queue.",
      },
      {
        id: "section-2",
        title: "Process Design",
        sectionType: "EXPERIENCE",
        content:
          "Built workflow architecture and escalation playbooks that reduced handoff friction and clarified incident routing.",
      },
      {
        id: "section-3",
        title: "Cross-Functional Execution",
        sectionType: "EXPERIENCE",
        content:
          "Partnered with product and engineering on service delivery priorities and operating rhythm for a scaling SaaS environment.",
      },
    ];
    const cycle = runGoldStandardSelfImprovementCycle({
      planInput: {
        fitScore: 84,
        jobTitle: "Director of Support Operations",
        jobCompany: "Acme",
        jobDescription:
          "Lead support operations, incident response, process architecture, and cross-functional execution for a scaling SaaS team.",
        jobRequirements: [
          "Support operations rigor",
          "Incident management leadership",
          "Process architecture",
          "Cross-functional execution",
        ],
        baselineSections,
      },
      generatedResume: {
        summary:
          "Results-driven leader with a proven track record of delivering results across customer-facing operations and team initiatives.",
        bullets: [
          "Responsible for support work and team coordination across multiple projects.",
          "Leveraged cross-functional relationships to support service goals and helped the team stay organized.",
          "Utilized process improvements to make things better for customers and internal stakeholders.",
        ],
      },
      generatedCoverLetter: {
        opening: "I am excited to apply for this role and bring my background to your team.",
        bodyParagraphs: [
          "I have a strong track record of working with many teams and doing important work in fast-moving environments.",
          "My experience makes me a great fit because I am organized, collaborative, and committed to results.",
        ],
        closingParagraph: "Thank you for your time and consideration.",
      },
      benchmark,
    });

    expect(cycle.refinedPlan.positioningFrame).toBe(cycle.initialPlan.positioningFrame);
    expect(cycle.refinedPlan.selectedEvidence.length).toBeLessThanOrEqual(cycle.initialPlan.selectedEvidence.length);
    for (const evidence of cycle.refinedPlan.selectedEvidence) {
      expect(
        baselineSections.some((section) =>
          evidence.approvedClaims.some((claim) => section.content.includes(claim)),
        ),
      ).toBe(true);
    }
    expect(cycle.refinedResume.summary.toLowerCase()).toContain("service delivery and incident operations leader");
    expect(cycle.refinedCoverLetter.opening).toContain("applying for");
  });
});
