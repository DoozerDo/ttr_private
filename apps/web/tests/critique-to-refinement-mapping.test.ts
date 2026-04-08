import { describe, expect, it } from "vitest";

import { buildDocumentStrategyPlan, REFINEMENT_PRESETS } from "@/lib/documentStrategyPlan";
import { buildDocumentCritique } from "@/lib/documentCritique";

function buildSamplePlan() {
  return buildDocumentStrategyPlan({
    fitScore: 84,
    jobTitle: "Director of Support",
    jobCompany: "Acme",
    jobDescription:
      "Lead support operations, workflow design, and cross-functional coordination for a SaaS platform.",
    jobRequirements: [
      "Own support operations strategy.",
      "Partner with product and engineering.",
      "Improve workflow quality and service delivery.",
    ],
    baselineSections: [
      {
        id: "section-1",
        title: "Support Operations",
        sectionType: "EXPERIENCE",
        content:
          "Led support operations programs, reduced average response time by 24%, and partnered with engineering on service delivery playbooks.",
      },
      {
        id: "section-2",
        title: "Process Design",
        sectionType: "EXPERIENCE",
        content:
          "Designed workflow automation that removed duplicate work, improved SLA adherence, and clarified escalation paths.",
      },
    ],
  });
}

describe("critique to refinement mapping", () => {
  it("maps critique issues to valid guided refinement presets", () => {
    const plan = buildSamplePlan();
    const critique = buildDocumentCritique({
      plan,
      resumeModel: {
        summary:
          "Results-driven leader with a proven track record of delivering results across teams in fast-paced environments.",
        experience: [
          {
            company: "Acme",
            roleTitle: "Support Operations Lead",
            bullets: [
              "Led support initiatives and delivered results across teams.",
              "Worked across teams to improve outcomes and drive results.",
            ],
          },
        ],
      },
      coverLetterParagraphs: [
        "Dear Hiring Team,",
        "I am excited to apply and believe my background includes leading teams and delivering results.",
        "My resume shows that I have experience in support, operations, and leadership across teams.",
        "Sincerely,",
      ],
    });

    expect(critique).not.toBeNull();
    for (const issue of critique?.topIssues ?? []) {
      expect(issue.recommendedRefinementTypes.length).toBeGreaterThan(0);
      for (const key of issue.recommendedRefinementTypes) {
        expect(REFINEMENT_PRESETS.some((preset) => preset.key === key)).toBe(true);
      }
    }
  });
});

