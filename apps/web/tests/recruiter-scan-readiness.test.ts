import { describe, expect, it } from "vitest";

import { buildDocumentStrategyPlan } from "@/lib/documentStrategyPlan";
import { buildRoleMatchFinalPass } from "@/lib/roleMatchFinalPass";

function buildScanPlan() {
  const plan = buildDocumentStrategyPlan({
    fitScore: 86,
    jobTitle: "Director of Support Operations",
    jobCompany: "Acme",
    jobDescription:
      "Lead support operations, incident management leadership, process architecture, and cross-functional execution.",
    jobRequirements: ["Support operations", "Incident management", "Process architecture"],
    jobResponsibilities: ["Lead support operations strategy", "Improve incident response"],
    baselineSections: [
      {
        id: "section-1",
        title: "Support Operations",
        sectionType: "EXPERIENCE",
        content:
          "Led support operations, reduced response times, and improved SLA adherence.",
      },
      {
        id: "section-2",
        title: "Process Architecture",
        sectionType: "EXPERIENCE",
        content:
          "Built process architecture and incident response workflows that clarified escalation paths.",
      },
      {
        id: "section-3",
        title: "Cross-Functional Execution",
        sectionType: "EXPERIENCE",
        content:
          "Partnered with product and engineering to scale support operations.",
      },
    ],
  });

  plan.roleLens.priorities = [
    "support operations rigor",
    "incident management leadership",
    "process architecture",
  ];
  plan.roleLens.requiredSignals = ["support operations", "incident management", "process architecture"];
  plan.roleLens.targetKeywords = ["support operations", "incident management", "process architecture", "SLA"];
  plan.selectedEvidence = [
    {
      baselineSection: "Support Operations",
      sourceId: "section-1",
      matchedSignals: ["support operations", "SLA"],
      whySelected: "Core operations evidence.",
      approvedClaims: ["Improved response times"],
      rank: 1,
      score: 99,
    },
    {
      baselineSection: "Process Architecture",
      sourceId: "section-2",
      matchedSignals: ["incident response", "process architecture"],
      whySelected: "Process and incident evidence.",
      approvedClaims: ["Clarified escalation paths"],
      rank: 2,
      score: 96,
    },
  ];
  plan.documentQualityScore = 91;
  plan.qualityPass.framingStrength = "high";
  plan.qualityPass.emphasisConfidence = "high";
  return plan;
}

describe("recruiter scan readiness", () => {
  it("flags generic top-third reads and buried proof", () => {
    const plan = buildScanPlan();
    const finalPass = buildRoleMatchFinalPass({
      plan,
      resumeModel: {
        summary:
          "Results-driven leader with a proven track record of delivering results in fast-paced environments.",
        experience: [
          {
            company: "Acme",
            roleTitle: "Support Operations Lead",
            bullets: [
              "Helped with team coordination.",
              "Built process architecture and incident response workflows.",
              "Led support operations and improved SLA adherence.",
            ],
          },
        ],
      },
      coverLetterParagraphs: [
        "Dear Hiring Team,",
        "I am excited to apply and bring broad leadership experience to your team.",
        "Sincerely,",
      ],
      jobDescription:
        "Lead support operations, incident management leadership, process architecture, and cross-functional execution.",
    });

    expect(finalPass.recruiterScanRisks.some((risk) => risk.type === "top_third_too_generic")).toBe(true);
    expect(finalPass.recruiterScanRisks.some((risk) => risk.type === "proof_not_visible_early")).toBe(true);
  });

  it("recognizes when the scan is already strong", () => {
    const plan = buildScanPlan();
    const finalPass = buildRoleMatchFinalPass({
      plan,
      resumeModel: {
        summary:
          "Support operations rigor leader focused on support operations rigor, incident management leadership, and process architecture.",
        experience: [
          {
            company: "Acme",
            roleTitle: "Support Operations Lead",
            bullets: [
              "Led support operations rigor and improved SLA adherence.",
              "Built incident management leadership workflows and process architecture.",
              "Improved cross-team operating rhythm and escalation follow-through.",
            ],
          },
        ],
      },
      coverLetterParagraphs: [
        "Dear Hiring Team,",
        "I am excited to bring support operations rigor, incident management leadership, and process architecture to this role.",
        "Sincerely,",
      ],
      jobDescription:
        "Lead support operations, incident management leadership, process architecture, and cross-functional execution.",
    });

    expect(finalPass.overallMatchReadiness).toBe("needs_tightening");
    expect(finalPass.priorityCoverage.filter((entry) => entry.covered).length).toBe(3);
    expect(finalPass.recruiterScanRisks.every((risk) => risk.severity !== "high")).toBe(true);
  });
});
