import { describe, expect, it } from "vitest";

import { runGoldStandardSelfImprovementCycle } from "@/lib/selfImprovementLoop";
import {
  GOLD_STANDARD_BENCHMARK_FIXTURES,
} from "@shared/goldStandardCalibration";
import { buildSupportOpsCalibrationPlan } from "./gold-standard-test-data";

describe("feedback improves output", () => {
  it("uses one feedback-driven regeneration to improve calibration scores", () => {
    const benchmark = GOLD_STANDARD_BENCHMARK_FIXTURES[0];
    const planInput = {
      ...buildSupportOpsCalibrationPlan(),
      fitScore: 84,
    };
    const cycle = runGoldStandardSelfImprovementCycle({
      planInput: {
        fitScore: planInput.fitScore,
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
              "Coordinated general operations work and supported multiple teams across several projects without a strong role-specific frame.",
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

    expect(cycle.feedback.adjustments.length).toBeGreaterThan(0);
    expect(cycle.refinedCalibration.dimensionScores.languageSharpness).toBeGreaterThanOrEqual(
      cycle.initialCalibration.dimensionScores.languageSharpness,
    );
    expect(cycle.refinedCalibration.dimensionScores.coverLetterSpecificity).toBeGreaterThanOrEqual(
      cycle.initialCalibration.dimensionScores.coverLetterSpecificity,
    );
    expect(cycle.refinedCalibration.dimensionScores.framingAlignment).toBeGreaterThanOrEqual(
      cycle.initialCalibration.dimensionScores.framingAlignment,
    );
    expect(cycle.refinedResume.summary.toLowerCase()).not.toContain("results-driven");
    expect(cycle.refinedCoverLetter.opening.toLowerCase()).toContain("applying for");
  });
});

