export const FIT_REVIEW_DIMENSIONS = [
  "role_scope_and_seniority",
  "support_operations_and_process_rigor",
  "tooling_and_platform_experience",
  "domain_and_business_context",
  "change_leadership_and_customer_advocacy",
] as const;

export type FitReviewDimensionKey = (typeof FIT_REVIEW_DIMENSIONS)[number];

export const FIT_REVIEW_DIMENSION_LABELS: Record<FitReviewDimensionKey, string> = {
  role_scope_and_seniority: "Leadership level",
  support_operations_and_process_rigor: "Support operations",
  tooling_and_platform_experience: "Tools and systems",
  domain_and_business_context: "Industry experience",
  change_leadership_and_customer_advocacy: "Change and customer impact",
};
