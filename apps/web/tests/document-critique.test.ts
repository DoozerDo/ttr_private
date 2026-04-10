import { describe, expect, it } from "vitest";

import { buildDocumentStrategyPlan } from "@shared/documentStrategyPlan";
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
    jobResponsibilities: [
      "Lead support operations programs.",
      "Coordinate service delivery across teams.",
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

describe("document critique", () => {
  it("produces a structured critique and ranks the highest-value weakness first", () => {
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
            ],
          },
        ],
      },
      coverLetterParagraphs: [
        "Dear Hiring Team,",
        "I am a results-driven leader with a proven track record of delivering results across teams.",
        "My resume shows that I have a proven track record of leading teams and delivering results.",
        "Sincerely,",
      ],
    });

    expect(critique).not.toBeNull();
    expect(critique?.overallAssessment).toBe("weak");
    expect(critique?.topIssues[0]?.type).toBe("summary_generic");
    expect(critique?.topIssues[0]?.severity).toBe("high");
    expect(critique?.recommendedNextAction?.label).toBe("Tighten the summary");
    expect(critique?.recommendedNextAction?.target).toBe("resume");
    expect(critique?.topIssues.length).toBeGreaterThan(0);
  });
});

