export type ScoreBreakdownDimensionKey =
  | "role_scope_and_seniority"
  | "support_operations_and_process_rigor"
  | "tooling_and_platform_experience"
  | "domain_and_business_context"
  | "change_leadership_and_customer_advocacy";

export type ScoreBreakdown = {
  total_score: number;
  dimensions: Array<{
    key: ScoreBreakdownDimensionKey;
    label: string;
    score: number;
    weight: number;
  }>;
};

const EVIDENCE_LABEL_BY_KEY: Record<ScoreBreakdownDimensionKey, string> = {
  role_scope_and_seniority: "Leadership scope alignment",
  support_operations_and_process_rigor: "Operational domain alignment",
  tooling_and_platform_experience: "Tooling/platform alignment",
  domain_and_business_context: "Customer environment alignment",
  change_leadership_and_customer_advocacy: "Change leadership alignment",
};

function trimEvidenceLine(line: string, maxLength = 80): string {
  if (line.length <= maxLength) return line;
  return `${line.slice(0, maxLength - 1).trimEnd()}...`;
}

export function buildEvidenceLines(scoreBreakdown?: ScoreBreakdown | null): string[] {
  if (!scoreBreakdown?.dimensions?.length) return [];

  return scoreBreakdown.dimensions
    .map((dimension) => ({
      ...dimension,
      contribution: dimension.weight > 0 ? dimension.score / dimension.weight : 0,
    }))
    .filter((dimension) => dimension.score > 0 && dimension.contribution > 0)
    .sort((a, b) => {
      if (b.contribution !== a.contribution) return b.contribution - a.contribution;
      return b.score - a.score;
    })
    .slice(0, 3)
    .map((dimension) =>
      trimEvidenceLine(`${EVIDENCE_LABEL_BY_KEY[dimension.key]}: ${dimension.label}.`),
    );
}
