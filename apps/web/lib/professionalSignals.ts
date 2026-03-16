import type { BaselineDto } from "@/lib/baselines";

export type ProfessionalSignalId =
  | "customer_operations_leadership"
  | "support_process_design"
  | "incident_management"
  | "cross_functional_coordination"
  | "tooling_and_workflow_operations"
  | "platform_ownership_scope"
  | "organizational_scale"
  | "change_leadership"
  | "quantified_business_impact"
  | "domain_and_customer_context";

export type ProfessionalSignalDefinition = {
  id: ProfessionalSignalId;
  label: string;
  keywords: string[];
  effect: string;
  roleFitCopy: string;
  developingCopy: string;
};

export type ProfessionalSignalScore = {
  id: ProfessionalSignalId;
  label: string;
  score: number;
  effect: string;
  roleFitCopy: string;
  developingCopy: string;
};

export type SignalGraphViewModel = {
  strongSignals: ProfessionalSignalScore[];
  developingSignals: ProfessionalSignalScore[];
  identifiedSignalCount: number;
  strongSignalCount: number;
  developingSignalCount: number;
  hasQuantifiedImpactSignal: boolean;
  effectLines: string[];
  fallbackUsed: boolean;
};

export type RoleSignalAlignmentViewModel = {
  strongForRole: string[];
  weakerForRole: string[];
  summary: string;
  fallbackUsed: boolean;
};

export const PROFESSIONAL_SIGNAL_DEFINITIONS: ProfessionalSignalDefinition[] = [
  {
    id: "customer_operations_leadership",
    label: "Customer Operations Leadership",
    keywords: ["customer", "support", "operations", "service delivery", "success"],
    effect: "Strong operational signals improve alignment for support and customer operations roles.",
    roleFitCopy: "This role benefits from operational leadership signal already present in your baseline.",
    developingCopy: "Clarify the range of customer operations leadership you have owned.",
  },
  {
    id: "support_process_design",
    label: "Support Process Design",
    keywords: ["process", "workflow", "playbook", "sop", "design", "architecture"],
    effect: "Clear process-design signal transfers well across operations-heavy roles.",
    roleFitCopy: "This role values process design signal and operational rigor.",
    developingCopy: "Add clearer examples of the systems or workflows you designed.",
  },
  {
    id: "incident_management",
    label: "Incident Management",
    keywords: ["incident", "escalation", "outage", "severity", "triage", "reliability"],
    effect: "Incident-management signal strengthens fit for high-accountability support environments.",
    roleFitCopy: "This role aligns with incident-response and operational control signal.",
    developingCopy: "Show where you led the response model rather than simply supported it.",
  },
  {
    id: "cross_functional_coordination",
    label: "Cross Functional Coordination",
    keywords: ["cross-functional", "stakeholder", "partnered", "product", "engineering", "finance"],
    effect: "Cross-functional signal improves transfer into roles that coordinate across teams.",
    roleFitCopy: "This role benefits from coordination signal spanning product, engineering, or customer teams.",
    developingCopy: "Clarify the breadth of coordination and the functions you influenced.",
  },
  {
    id: "tooling_and_workflow_operations",
    label: "Tooling and Workflow Operations",
    keywords: ["zendesk", "salesforce", "jira", "tooling", "platform", "workflow", "system"],
    effect: "Tooling and workflow signal improves fit where platform fluency is part of execution.",
    roleFitCopy: "This role rewards stronger signal around systems, tooling, and workflow operations.",
    developingCopy: "Add more explicit platform and tooling ownership signal.",
  },
  {
    id: "platform_ownership_scope",
    label: "Platform Ownership Scope",
    keywords: ["owner", "ownership", "administrator", "governance", "implementation", "admin"],
    effect: "Platform-ownership signal influences higher-complexity operations and systems roles.",
    roleFitCopy: "This role appears to expect deeper platform-ownership signal.",
    developingCopy: "Make it clearer whether you owned the platform or operated within it.",
  },
  {
    id: "organizational_scale",
    label: "Organizational Scale",
    keywords: ["global", "regional", "24/7", "high volume", "multi-site", "scale"],
    effect: "Scale signal helps unlock stronger leadership and enterprise-oriented role matches.",
    roleFitCopy: "Underpowered scale signal may limit top-end leadership match scores.",
    developingCopy: "Add team, coverage, volume, or enterprise scope indicators.",
  },
  {
    id: "change_leadership",
    label: "Change Leadership",
    keywords: ["change", "transformation", "rollout", "adoption", "migration", "led"],
    effect: "Change-leadership signal supports stronger transfer into transformation or systems-evolution roles.",
    roleFitCopy: "This role appears to expect stronger change-leadership signal than the baseline currently shows.",
    developingCopy: "Add clearer examples of leading transitions, migrations, or operating change.",
  },
  {
    id: "quantified_business_impact",
    label: "Quantified Business Impact",
    keywords: ["%", "reduced", "improved", "kpi", "metric", "csat", "nps", "sla"],
    effect: "Quantified impact signal improves confidence in role fit across multiple directions.",
    roleFitCopy: "Stronger quantified impact signal would improve score confidence for this role.",
    developingCopy: "Use measurable customer or operational outcomes where possible.",
  },
  {
    id: "domain_and_customer_context",
    label: "Domain and Customer Context",
    keywords: ["customer", "domain", "industry", "enterprise", "saas", "business"],
    effect: "Domain and customer-context signal improves transfer into role-specific fit.",
    roleFitCopy: "This role likely expects deeper domain or customer-context signal.",
    developingCopy: "Clarify the business environment and customer context behind the work.",
  },
];

function buildCorpus(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

function scoreSignals(corpus: string, bias: Partial<Record<ProfessionalSignalId, number>> = {}) {
  return PROFESSIONAL_SIGNAL_DEFINITIONS.map((definition) => {
    const keywordHits = definition.keywords.filter((keyword) => corpus.includes(keyword)).length;
    const score = Math.max(
      10,
      Math.min(96, 18 + keywordHits * 16 + (bias[definition.id] ?? 0)),
    );

    return {
      id: definition.id,
      label: definition.label,
      score,
      effect: definition.effect,
      roleFitCopy: definition.roleFitCopy,
      developingCopy: definition.developingCopy,
    } satisfies ProfessionalSignalScore;
  });
}

function dedupeStrings(lines: string[]): string[] {
  return Array.from(new Set(lines.filter((line) => line.trim().length > 0)));
}

export function buildBaselineSignalGraph(input: { baseline: BaselineDto | null }): SignalGraphViewModel {
  const baselineLines =
    input.baseline?.sections?.flatMap((section) => [section.title ?? "", section.content]) ?? [];
  const corpus = buildCorpus(baselineLines);
  const scoredSignals = scoreSignals(corpus);
  const identifiedSignals = scoredSignals.filter((signal) => signal.score >= 30);
  const strongPool = identifiedSignals.filter((signal) => signal.score >= 58);
  const developingPool = identifiedSignals.filter((signal) => signal.score >= 30 && signal.score < 58);
  const strongSignals = [...strongPool].sort((a, b) => b.score - a.score).slice(0, 5);
  const developingSignals = [...developingPool].sort((a, b) => b.score - a.score).slice(0, 4);
  const effectLines = dedupeStrings(
    [...strongSignals.slice(0, 2), ...developingSignals.slice(0, 1)].map((signal) => signal.effect),
  ).slice(0, 3);
  const hasQuantifiedImpactSignal = identifiedSignals.some(
    (signal) => signal.id === "quantified_business_impact" && signal.score >= 58,
  );

  return {
    strongSignals,
    developingSignals,
    identifiedSignalCount: identifiedSignals.length,
    strongSignalCount: strongPool.length,
    developingSignalCount: developingPool.length,
    hasQuantifiedImpactSignal,
    effectLines:
      effectLines.length > 0
        ? effectLines
        : [
            "Strong professional signals improve targeting quality across related roles.",
            "Developing signals can limit how confidently the platform transfers your baseline into score outcomes.",
          ],
    fallbackUsed: corpus.trim().length === 0,
  };
}

type ResultsSignalAlignmentInput = {
  strengths: string[];
  criticalGapTitles: string[];
  recommendedActions: string[];
  scoreBreakdownDimensions: Array<{ key: string; label: string; score: number; weight: number }>;
  verdictLabel?: string | null;
};

function buildResultsBias(input: ResultsSignalAlignmentInput): Partial<Record<ProfessionalSignalId, number>> {
  const bias: Partial<Record<ProfessionalSignalId, number>> = {};

  for (const dimension of input.scoreBreakdownDimensions) {
    const percent =
      dimension.weight > 0 ? Math.round((dimension.score / dimension.weight) * 100) : 0;

    if (dimension.key === "support_operations_and_process_rigor") {
      bias.support_process_design = (bias.support_process_design ?? 0) + percent - 50;
      bias.customer_operations_leadership = (bias.customer_operations_leadership ?? 0) + percent - 55;
    }
    if (dimension.key === "tooling_and_platform_experience") {
      bias.tooling_and_workflow_operations = (bias.tooling_and_workflow_operations ?? 0) + percent - 50;
      bias.platform_ownership_scope = (bias.platform_ownership_scope ?? 0) + percent - 55;
    }
    if (dimension.key === "role_scope_and_seniority") {
      bias.organizational_scale = (bias.organizational_scale ?? 0) + percent - 55;
      bias.customer_operations_leadership = (bias.customer_operations_leadership ?? 0) + percent - 55;
    }
    if (dimension.key === "change_leadership_and_customer_advocacy") {
      bias.change_leadership = (bias.change_leadership ?? 0) + percent - 50;
      bias.cross_functional_coordination = (bias.cross_functional_coordination ?? 0) + percent - 55;
    }
    if (dimension.key === "domain_and_business_context") {
      bias.domain_and_customer_context = (bias.domain_and_customer_context ?? 0) + percent - 50;
      bias.quantified_business_impact = (bias.quantified_business_impact ?? 0) + percent - 55;
    }
  }

  return bias;
}

export function buildResultsSignalAlignment(
  input: ResultsSignalAlignmentInput,
): RoleSignalAlignmentViewModel {
  const positiveCorpus = buildCorpus(input.strengths);
  const negativeCorpus = buildCorpus([...input.criticalGapTitles, ...input.recommendedActions]);
  const bias = buildResultsBias(input);
  const positiveScores = scoreSignals(positiveCorpus, bias);
  const negativeScores = scoreSignals(negativeCorpus);

  const strongForRole = positiveScores
    .filter((signal) => signal.score >= 34)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((signal) => signal.label);

  const weakerForRole = negativeScores
    .filter((signal) => signal.score >= 28)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((signal) => signal.label);

  const safeStrong = strongForRole.length ? strongForRole : ["Professional signals are still being interpreted"];
  const safeWeak =
    weakerForRole.length > 0
      ? weakerForRole
      : ["Signal clarity is still limited for the highest-leverage requirements"];

  const summary =
    strongForRole.length || weakerForRole.length
      ? `This role aligns strongly with ${safeStrong[0].toLowerCase()}${safeStrong[1] ? ` and ${safeStrong[1].toLowerCase()}` : ""}, but appears to require stronger ${safeWeak[0].toLowerCase()}${safeWeak[1] ? ` and ${safeWeak[1].toLowerCase()}` : ""}.`
      : "This score reflects how clearly your baseline signal transfers into the requirements of this role.";

  return {
    strongForRole: safeStrong,
    weakerForRole: safeWeak,
    summary,
    fallbackUsed: strongForRole.length === 0 && weakerForRole.length === 0,
  };
}
