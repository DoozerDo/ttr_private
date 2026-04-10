import { describe, expect, it } from "vitest";

import { buildDocumentStrategyPlan } from "@shared/documentStrategyPlan";
import { buildRoleMatchFinalPass } from "@shared/roleMatchFinalPass";

function buildKeywordAuditPlan() {
  const plan = buildDocumentStrategyPlan({
    fitScore: 79,
    jobTitle: "Support Operations Manager",
    jobCompany: "Acme",
    jobDescription:
      "Support operations, incident response, process architecture, and cross-functional coordination for a SaaS support team.",
    jobRequirements: ["Support operations", "Incident response", "Process architecture"],
    jobResponsibilities: ["Improve support operations", "Coordinate incident response"],
    baselineSections: [
      {
        id: "section-1",
        title: "Support Operations",
        sectionType: "EXPERIENCE",
        content:
          "Led support operations and improved SLA adherence across a high-volume queue.",
      },
      {
        id: "section-2",
        title: "Incident Response",
        sectionType: "EXPERIENCE",
        content:
          "Built incident response workflows and architecture for escalations.",
      },
    ],
  });

  plan.roleLens.priorities = ["support operations", "incident response", "process architecture"];
  plan.roleLens.requiredSignals = ["support operations", "incident response", "process architecture"];
  plan.roleLens.targetKeywords = [
    "support operations",
    "incident response",
    "process architecture",
    "cross-functional coordination",
    "SLA",
    "customer experience strategy",
  ];
  plan.selectedEvidence = [
    {
      baselineSection: "Support Operations",
      sourceId: "section-1",
      matchedSignals: ["support operations", "SLA"],
      whySelected: "Core support operations evidence.",
      approvedClaims: ["Improved SLA adherence"],
      rank: 1,
      score: 99,
    },
    {
      baselineSection: "Incident Response",
      sourceId: "section-2",
      matchedSignals: ["incident response", "architecture"],
      whySelected: "Incident workflow evidence.",
      approvedClaims: ["Built workflows"],
      rank: 2,
      score: 95,
    },
  ];
  plan.documentQualityScore = 84;
  plan.qualityPass.emphasisConfidence = "high";
  return plan;
}

describe("keyword alignment audit", () => {
  it("detects strong matches, missing important terms, and excessive repetition without recommending unsupported insertion", () => {
    const plan = buildKeywordAuditPlan();
    const finalPass = buildRoleMatchFinalPass({
      plan,
      resumeModel: {
        summary:
          "Support operations leader focused on support operations, incident response, and process architecture.",
      experience: [
          {
            company: "Acme",
            roleTitle: "Support Operations Manager",
            bullets: [
              "Led support operations and incident response workflows.",
              "Built process architecture that improved SLA adherence.",
              "Partnered cross-functionally with product and engineering.",
            ],
          },
        ],
      },
      coverLetterParagraphs: [
        "Dear Hiring Team,",
        "I would be excited to bring support operations, incident response, and process architecture experience to this role.",
        "Sincerely,",
      ],
      jobDescription:
        "Support operations, incident response, process architecture, and cross-functional coordination for a SaaS support team.",
    });

    expect(finalPass.keywordAlignment.strongMatches).toContain("support operations");
    expect(finalPass.keywordAlignment.strongMatches).toContain("cross-functional coordination");
    expect(finalPass.keywordAlignment.missingButImportant).toContain("customer experience strategy");
    expect(finalPass.keywordAlignment.stuffedOrExcessive).not.toContain("support operations");
    expect(
      finalPass.recommendedFinalAdjustments.some((adjustment) => adjustment.label.includes("cross-functional coordination")),
    ).toBe(false);
  });
});

