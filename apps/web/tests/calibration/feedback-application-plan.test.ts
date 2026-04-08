import { describe, expect, it } from "vitest";

import { buildCalibrationFeedback } from "@/lib/calibrationFeedback";
import { buildDocumentStrategyPlan } from "@/lib/documentStrategyPlan";
import { buildGoldStandardCalibration, listGoldStandardBenchmarkFixtures } from "@/lib/goldStandardCalibration";

describe("feedback application to the plan", () => {
  it("changes plan weighting and suppression behavior without changing the positioning frame", () => {
    const input = {
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
      baselineSections: [
        {
          id: "section-1",
          title: "General Operations",
          sectionType: "EXPERIENCE",
          content:
            "Supported customer operations, service coordination, and workflow management across several teams without a strong role-specific frame.",
        },
        {
          id: "section-2",
          title: "Support Operations Rigour",
          sectionType: "EXPERIENCE",
          content:
            "Built support operations rigor, escalation routines, and process architecture that reduced repeat tickets.",
        },
        {
          id: "section-3",
          title: "Process Design",
          sectionType: "EXPERIENCE",
          content:
            "Created workflow architecture and clarified incident routing for cross-functional partners.",
        },
      ],
    };

    const basePlan = buildDocumentStrategyPlan(input);
    const benchmark = listGoldStandardBenchmarkFixtures()[0];
    const calibration = buildGoldStandardCalibration({
      plan: basePlan,
      generatedResume: buildSupportOpsOutput(),
      generatedCoverLetter: buildSupportOpsCoverOutput(),
      benchmark,
    });
    const feedback = buildCalibrationFeedback({ calibration, plan: basePlan });
    const refinedPlan = buildDocumentStrategyPlan(input, feedback);

    expect(refinedPlan.positioningFrame).toBe(basePlan.positioningFrame);
    expect(refinedPlan.selectedEvidence[0]?.baselineSection).toBe("Support Operations Rigour");
    expect(refinedPlan.selectedEvidence[0]?.score).toBeGreaterThan(basePlan.selectedEvidence[0]?.score ?? 0);
    expect(refinedPlan.selectedEvidence.length).toBeLessThanOrEqual(basePlan.selectedEvidence.length);
    expect(refinedPlan.qualityPass.mustLeadWith[0]).toBe(refinedPlan.positioningFrame);
  });
});

function buildSupportOpsOutput() {
  return {
    summary:
      "Results-driven leader with a proven track record of delivering results across customer-facing operations and team initiatives.",
    bullets: [
      "Responsible for support work and team coordination across multiple projects.",
      "Leveraged cross-functional relationships to support service goals and helped the team stay organized.",
      "Utilized process improvements to make things better for customers and internal stakeholders.",
    ],
  };
}

function buildSupportOpsCoverOutput() {
  return {
    opening: "I am excited to apply for this role and bring my background to your team.",
    bodyParagraphs: [
      "I have a strong track record of working with many teams and doing important work in fast-moving environments.",
      "My experience makes me a great fit because I am organized, collaborative, and committed to results.",
    ],
    closingParagraph: "Thank you for your time and consideration.",
  };
}
