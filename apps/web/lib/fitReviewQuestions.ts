export type FitReviewDimensionKey =
  | "role_scope_and_seniority"
  | "support_operations_and_process_rigor"
  | "tooling_and_platform_experience"
  | "domain_and_business_context"
  | "change_leadership_and_customer_advocacy";

export const SCORING_DIMENSION_ORDER: FitReviewDimensionKey[] = [
  "role_scope_and_seniority",
  "support_operations_and_process_rigor",
  "tooling_and_platform_experience",
  "domain_and_business_context",
  "change_leadership_and_customer_advocacy",
];

export const fitReviewDimensionLabels: Record<FitReviewDimensionKey, string> = {
  role_scope_and_seniority: "Leadership level",
  support_operations_and_process_rigor: "Support operations",
  tooling_and_platform_experience: "Tools and systems",
  domain_and_business_context: "Domain alignment",
  change_leadership_and_customer_advocacy: "Change and customer impact",
};

export const fitReviewQuestions: Record<FitReviewDimensionKey, string[]> = {
  role_scope_and_seniority: [
    "What size teams did you lead and which functions were under your remit?",
    "What cross-functional ownership or operating cadence did you hold?",
  ],
  support_operations_and_process_rigor: [
    "Describe workflows, SLAs, or escalations you owned.",
    "What operational scale did you support (headcount, regions, or volume)?",
    "What processes did you define, improve, or steady?",
  ],
  tooling_and_platform_experience: [
    "Which systems did you configure, govern, or administer?",
    "What automations, routing, macros, or reporting did you build?",
  ],
  domain_and_business_context: [
    "Which industries or regulated contexts did you support directly?",
    "Any compliance or regulatory workflows you owned (SOC2, HIPAA, etc.)?",
  ],
  change_leadership_and_customer_advocacy: [
    "Describe a change initiative you led that improved customer outcomes or support performance.",
    "How did you influence product or stakeholders with customer evidence?",
  ],
};

export type FitReviewAdditionPayload = {
  dimensionId: FitReviewDimensionKey;
  approvedText: string;
};
