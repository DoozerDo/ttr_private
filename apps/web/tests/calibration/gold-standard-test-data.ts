import { buildDocumentStrategyPlan, type DocumentStrategyPlan } from "@shared/documentStrategyPlan";

export function buildSupportOpsCalibrationPlan(): DocumentStrategyPlan {
  const plan = buildDocumentStrategyPlan({
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

export function buildWeakSupportOpsResume() {
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

export function buildWeakSupportOpsCoverLetter() {
  return {
    opening: "I am excited to apply for this role and bring my background to your team.",
    bodyParagraphs: [
      "I have a strong track record of working with many teams and doing important work in fast-moving environments.",
      "My experience makes me a great fit because I am organized, collaborative, and committed to results.",
    ],
    closingParagraph: "Thank you for your time and consideration.",
  };
}

