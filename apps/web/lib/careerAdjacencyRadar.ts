import type { ScoreBreakdownDimensionKey } from "@/lib/evidenceLines";

export type ScoreBreakdownLike = {
  total_score: number;
  dimensions: Array<{
    key: string;
    label: string;
    score: number;
    weight: number;
  }>;
};

export type CareerAdjacencyRadarAxisKey =
  | "support_operations_leadership"
  | "incident_reliability_noc"
  | "customer_experience_strategy"
  | "technical_program_change_management"
  | "tooling_platform_depth"
  | "industry_context";

export type CareerAdjacencyRadarDimension = {
  key: CareerAdjacencyRadarAxisKey;
  label: string;
  value: number;
  description: string;
  sourceKeys: ScoreBreakdownDimensionKey[];
};

type RadarSourceWeight = {
  key: ScoreBreakdownDimensionKey;
  weight: number;
};

export type CareerAdjacencyRadarAxisDefinition = {
  key: CareerAdjacencyRadarAxisKey;
  label: string;
  teaserLabel: string;
  description: string;
  sources: RadarSourceWeight[];
};

export const CAREER_ADJACENCY_RADAR_AXIS_DEFINITIONS: CareerAdjacencyRadarAxisDefinition[] = [
  {
    key: "support_operations_leadership",
    label: "Support Operations Leadership",
    teaserLabel: "Support Ops Leadership",
    description: "Blends leadership scope with support ops and process rigor.",
    sources: [
      { key: "role_scope_and_seniority", weight: 0.4 },
      { key: "support_operations_and_process_rigor", weight: 0.6 },
    ],
  },
  {
    key: "incident_reliability_noc",
    label: "Incident / Reliability / NOC",
    teaserLabel: "Incident / Reliability",
    description: "Pairs support rigor with platform depth in incident-heavy environments.",
    sources: [
      { key: "support_operations_and_process_rigor", weight: 0.55 },
      { key: "tooling_and_platform_experience", weight: 0.3 },
      { key: "role_scope_and_seniority", weight: 0.15 },
    ],
  },
  {
    key: "customer_experience_strategy",
    label: "Customer Experience Strategy",
    teaserLabel: "CX Strategy",
    description: "Combines advocacy and business context into customer-facing strategy strength.",
    sources: [
      { key: "change_leadership_and_customer_advocacy", weight: 0.7 },
      { key: "domain_and_business_context", weight: 0.3 },
    ],
  },
  {
    key: "technical_program_change_management",
    label: "Technical Program / Change Management",
    teaserLabel: "Technical Program / Change",
    description: "Mixes change leadership with scope and operational execution.",
    sources: [
      { key: "change_leadership_and_customer_advocacy", weight: 0.45 },
      { key: "role_scope_and_seniority", weight: 0.3 },
      { key: "support_operations_and_process_rigor", weight: 0.25 },
    ],
  },
  {
    key: "tooling_platform_depth",
    label: "Tooling / Platform Depth",
    teaserLabel: "Tooling / Platform Depth",
    description: "Uses the direct tooling and platform score as-is.",
    sources: [{ key: "tooling_and_platform_experience", weight: 1 }],
  },
  {
    key: "industry_context",
    label: "Industry Context",
    teaserLabel: "Industry Context",
    description: "Uses the direct domain and business context score as-is.",
    sources: [{ key: "domain_and_business_context", weight: 1 }],
  },
];

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeDimensionPercent(
  dimension: ScoreBreakdownLike["dimensions"][number] | undefined,
): number {
  if (!dimension || dimension.weight <= 0) return 0;
  return clampPercent((dimension.score / dimension.weight) * 100);
}

function blendRadarAxis(
  dimensionPercentMap: Record<string, number>,
  sources: RadarSourceWeight[],
): number {
  return clampPercent(
    sources.reduce((sum, source) => sum + (dimensionPercentMap[source.key] ?? 0) * source.weight, 0),
  );
}

export function buildCareerAdjacencyRadarDimensions(
  scoreBreakdown?: ScoreBreakdownLike | null,
): CareerAdjacencyRadarDimension[] {
  if (!scoreBreakdown?.dimensions?.length) return [];

  const dimensionPercentMap = scoreBreakdown.dimensions.reduce(
    (accumulator, dimension) => {
      accumulator[dimension.key] = normalizeDimensionPercent(dimension);
      return accumulator;
    },
    {
      role_scope_and_seniority: 0,
      support_operations_and_process_rigor: 0,
      tooling_and_platform_experience: 0,
      domain_and_business_context: 0,
      change_leadership_and_customer_advocacy: 0,
    } as Record<string, number>,
  );

  return CAREER_ADJACENCY_RADAR_AXIS_DEFINITIONS.map((definition) => ({
    key: definition.key,
    label: definition.label,
    value: blendRadarAxis(dimensionPercentMap, definition.sources),
    description: definition.description,
    sourceKeys: definition.sources.map((source) => source.key),
  }));
}
