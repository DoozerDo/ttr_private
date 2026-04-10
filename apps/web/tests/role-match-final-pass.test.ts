import { describe, expect, it } from "vitest";

import { buildDocumentStrategyPlan } from "@shared/documentStrategyPlan";
import { buildRoleMatchFinalPass } from "@shared/roleMatchFinalPass";

function listSyntheticGenerationScenarioBundles() {
  return [
    {
      scenario: { name: "Support operations director" },
      job: {
        title: "Director of Support Operations",
        company: "Example SaaS",
        rawDescription:
          "Lead support operations, incident response, process architecture, and cross-functional execution for a scaling SaaS team. Own queue health, service quality, escalation routines, and operating rhythms that keep support predictable.",
        normalizedResponsibilities: [
          "Own support operations strategy and queue health.",
          "Improve incident response and escalation workflow quality.",
          "Partner with product and engineering on root cause fixes.",
          "Lead cross-functional operating reviews.",
        ],
        normalizedRequirements: [
          "Support operations rigor",
          "Incident management leadership",
          "Process architecture",
          "Cross-functional execution",
        ],
      },
      baseline: {
        sections: [
          {
            id: "support-ops-section-1",
            title: "Support Operations Leadership",
            sectionType: "EXPERIENCE",
            content:
              "Led support operations programs for a SaaS product team, improving SLA adherence, reducing repeat escalations, and building a steadier operating rhythm for frontline managers.",
          },
          {
            id: "support-ops-section-2",
            title: "Workflow And Incident Design",
            sectionType: "EXPERIENCE",
            content:
              "Built intake, triage, and escalation workflows that clarified ownership across support, product, and engineering.",
          },
        ],
      },
      benchmark: {
        approvedBenchmarkResume: {
          summary:
            "Customer Operations and Support Strategy leader focused on support operations rigor, workflow design, and cross-functional execution.",
          bullets: [
            "Led support operations for a high-volume service team and built intake, triage, and escalation routines that reduced repeat tickets.",
            "Worked with product and engineering partners to prioritize root-cause fixes and stabilize the most frequent incident paths.",
          ],
        },
        approvedBenchmarkCoverLetter: {
          opening: "Dear Hiring Team,",
          bodyParagraphs: [
            "I am excited to bring support operations rigor, incident management leadership, and process architecture to this role.",
            "My background includes cross-functional execution across product and engineering partners.",
          ],
          closingParagraph: "Sincerely,",
        },
      },
    },
  ];
}

function buildSamplePlan() {
  const plan = buildDocumentStrategyPlan({
    fitScore: 82,
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
    jobResponsibilities: [
      "Lead support operations strategy.",
      "Improve incident response and workflow quality.",
    ],
    baselineSections: [
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
    ],
  });

  plan.roleLens.priorities = [
    "support operations rigor",
    "incident management leadership",
    "process architecture",
    "cross-functional execution",
  ];
  plan.roleLens.requiredSignals = [
    "support operations",
    "incident response",
    "process architecture",
    "cross-functional",
  ];
  plan.roleLens.targetKeywords = [
    "support operations",
    "incident response",
    "process architecture",
    "cross-functional execution",
    "SaaS",
  ];
  plan.selectedEvidence = [
    {
      baselineSection: "Support Operations",
      sourceId: "section-1",
      matchedSignals: ["support operations", "SLA adherence"],
      whySelected: "Directly supports the role's core support operations priority.",
      approvedClaims: ["Reduced response time by 24%"],
      rank: 1,
      score: 98,
    },
    {
      baselineSection: "Process Design",
      sourceId: "section-2",
      matchedSignals: ["process architecture", "incident routing"],
      whySelected: "Shows workflow and incident process design.",
      approvedClaims: ["Clarified escalation paths"],
      rank: 2,
      score: 95,
    },
    {
      baselineSection: "Cross-Functional Execution",
      sourceId: "section-3",
      matchedSignals: ["cross-functional", "SaaS"],
      whySelected: "Shows cross-functional execution and role context.",
      approvedClaims: ["Partnered with product and engineering"],
      rank: 3,
      score: 92,
    },
  ];
  plan.documentQualityScore = 88;
  plan.qualityPass.emphasisConfidence = "high";
  plan.qualityPass.framingStrength = "high";
  return plan;
}

describe("role match final pass", () => {
  it("produces structured role-match output from the role lens and artifact pair", () => {
    const plan = buildSamplePlan();
    const finalPass = buildRoleMatchFinalPass({
      plan,
      resumeModel: {
        summary:
          "Results-driven leader who improves support operations rigor, incident management leadership, and process architecture across fast-moving environments.",
        experience: [
          {
            company: "Acme",
            roleTitle: "Support Operations Lead",
            bullets: [
              "Led support operations rigor and reduced response time by 24%.",
              "Built process architecture and incident management workflows that clarified escalation paths.",
              "Partnered with product and engineering on service delivery priorities.",
            ],
          },
        ],
      },
      coverLetterParagraphs: [
        "Dear Hiring Team,",
        "I am excited to bring support operations rigor, incident management leadership, and process architecture to this role.",
        "My background includes cross-functional execution across product and engineering partners.",
        "Sincerely,",
      ],
      jobDescription:
        "Lead support operations, incident response, process architecture, and cross-functional execution for a scaling SaaS team.",
    });

    expect(finalPass.overallMatchReadiness).toBe("needs_tightening");
    expect(finalPass.priorityCoverage).toHaveLength(4);
    expect(finalPass.priorityCoverage[0]).toMatchObject({
      priority: "support operations rigor",
      covered: true,
    });
    expect(finalPass.priorityCoverage[1]).toMatchObject({
      priority: "incident management leadership",
      covered: true,
    });
    expect(finalPass.recruiterScanRisks.some((risk) => risk.type === "top_third_too_generic")).toBe(true);
    expect(finalPass.recommendedFinalAdjustments[0]?.type).toBe("summary_tighten");
  });

  it("treats benchmark-like support operations phrasing as role-ready instead of excessively repetitive", () => {
    const bundle = listSyntheticGenerationScenarioBundles().find(
      (entry) => entry.scenario.name === "Support operations director",
    );
    expect(bundle).toBeTruthy();
    const benchmark = bundle?.benchmark;
    expect(benchmark).toBeTruthy();
    const plan = buildDocumentStrategyPlan({
      fitScore: 82,
      jobTitle: bundle?.job.title ?? "",
      jobCompany: bundle?.job.company ?? "",
      jobDescription: bundle?.job.rawDescription ?? "",
      jobRequirements: bundle?.job.normalizedRequirements ?? [],
      jobResponsibilities: bundle?.job.normalizedResponsibilities ?? [],
      baselineSections: (bundle?.baseline.sections ?? []).map((section) => ({
        id: section.id,
        title: section.title,
        sectionType: section.sectionType,
        content: section.content,
      })),
    });
    const finalPass = buildRoleMatchFinalPass({
      plan,
      resumeModel: {
        summary: benchmark?.approvedBenchmarkResume.summary ?? "",
        experience: [
          {
            company: "Acme",
            roleTitle: "Support Operations Director",
            bullets: benchmark?.approvedBenchmarkResume.bullets ?? [],
          },
        ],
      },
      coverLetterParagraphs: [
        benchmark?.approvedBenchmarkCoverLetter.opening ?? "",
        ...(benchmark?.approvedBenchmarkCoverLetter.bodyParagraphs ?? []),
        benchmark?.approvedBenchmarkCoverLetter.closingParagraph ?? "",
      ],
      jobDescription:
        bundle?.job.rawDescription ?? "",
    });

    expect(finalPass.overallMatchReadiness).toBe("ready");
    expect(finalPass.keywordAlignment.missingButImportant).toHaveLength(0);
    expect(finalPass.keywordAlignment.stuffedOrExcessive).toHaveLength(0);
    expect(finalPass.recruiterScanRisks.some((risk) => risk.type === "weak_keyword_presence")).toBe(false);
    expect(finalPass.recruiterScanRisks.some((risk) => risk.type === "cover_letter_not_role_specific")).toBe(false);
  });
});

