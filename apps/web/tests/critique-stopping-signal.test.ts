import { describe, expect, it } from "vitest";

import { buildDocumentStrategyPlan } from "@/lib/documentStrategyPlan";
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
      {
        id: "section-3",
        title: "Leadership",
        sectionType: "EXPERIENCE",
        content:
          "Managed a regional team, aligned cross-functional stakeholders, and scaled operating rhythm for a multi-site support model.",
      },
    ],
  });
}

describe("critique stopping signal", () => {
  it("marks a strong document pair as optional refinement only", () => {
    const plan = buildSamplePlan();
    const critique = buildDocumentCritique({
      plan,
      resumeModel: {
        summary:
          "Customer Operations and Support Strategy leader who scales SaaS support teams, designs workflows, and partners across product and engineering.",
        experience: [
          {
            company: "Acme",
            roleTitle: "Support Operations Lead",
            bullets: [
              "Led support operations programs and reduced average response time by 24%.",
              "Designed workflow automation that improved SLA adherence and removed duplicate work.",
              "Aligned product and engineering partners on escalation paths and service delivery playbooks.",
            ],
          },
        ],
      },
      coverLetterParagraphs: [
        "Dear Hiring Team,",
        "I am applying because this role needs someone who can turn service delivery priorities into a clear operating model.",
        "What draws me to the opportunity is the combination of cross-functional partnership, steady execution, and measurable improvement.",
        "Sincerely,",
      ],
    });

    expect(critique).not.toBeNull();
    expect(critique?.overallAssessment).toBe("strong");
    expect(critique?.recommendedNextAction).toBeNull();
    expect(critique?.topIssues.every((issue) => issue.severity !== "high")).toBe(true);
  });
});
