import { normalizeUserFacingRequirementLabel } from "@/lib/generationReadiness";

export type EvidenceSuggestion = {
  requirement: string;
  intro: string;
  context: string;
  description: string;
  scope: string;
  groundedSignals: string[];
};

export type BaselineEvidencePreview = {
  intro: string;
  signals: string[];
};

export type RequirementGapInsight = {
  requirement: string;
  currentSignal: string;
  roleExpectation: string;
  explanation: string;
  scope: string;
};

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function sentenceFromSignals(signals: string[]): string {
  const top = signals.slice(0, 3);
  if (!top.length) return "";
  if (top.length === 1) return top[0];
  if (top.length === 2) return `${top[0]} and ${top[1]}`;
  return `${top[0]}, ${top[1]}, and ${top[2]}`;
}

type CategoryFamily = "support_operations" | "change_leadership" | "leadership_scope";

const SUPPORT_OPERATIONS_CATEGORY_PATTERNS = [
  /\bsupport operations?\b/,
  /\bcustomer operations?\b/,
  /\bsupport leadership\b/,
  /\bsupport process ownership\b/,
  /\bservice delivery\b/,
  /\bescalation\b/,
  /\bincident\b/,
  /\bprocess rigor\b/,
  /\bworkflow\b/,
  /\bops\b/,
];

const CHANGE_LEADERSHIP_CATEGORY_PATTERNS = [
  /\bchange leadership\b/,
  /\btransformation\b/,
  /\boperating model\b/,
  /\boperational transformation\b/,
  /\bprocess rollout\b/,
  /\brollout\b/,
  /\badoption\b/,
  /\bmigration\b/,
];

const LEADERSHIP_SCOPE_CATEGORY_PATTERNS = [
  /\bleadership\b/,
  /\bseniority\b/,
  /\bscope\b/,
  /\bteam\b/,
  /\bscale\b/,
  /\bglobal\b/,
  /\bregional\b/,
];

const SUPPORT_OPERATIONS_EVIDENCE_PATTERNS = [
  /\bsupport operations?\b/,
  /\bcustomer operations?\b/,
  /\bsupport leadership\b/,
  /\bsupport process ownership\b/,
  /\bprocess ownership\b/,
  /\bservice delivery\b/,
  /\bescalation management\b/,
  /\bincident management\b/,
  /\bincident response\b/,
  /\bincident command\b/,
  /\bescalation ownership\b/,
  /\btriage\b/,
  /\bworkflow\b/,
  /\bsla\b/,
  /\bkpi\b/,
  /\bsupport queue\b/,
];

const CHANGE_LEADERSHIP_EVIDENCE_PATTERNS = [
  /\bchange leadership\b/,
  /\btransformation\b/,
  /\boperating model\b/,
  /\boperational transformation\b/,
  /\bprocess rollout\b/,
  /\brollout\b/,
  /\badoption\b/,
  /\bmigration\b/,
  /\bchange management\b/,
  /\bredesign\b/,
  /\breorganization\b/,
  /\blaunch\b/,
];

const LEADERSHIP_SCOPE_EVIDENCE_PATTERNS = [
  /\bteam of \d+/,
  /\d+\+/,
  /\bacross \d+/,
  /\borg(?:anization)?-?wide\b/,
  /\bglobal\b/,
  /\benterprise\b/,
  /\bmulti-site\b/,
  /\bcross-functional\b/,
  /\bportfolio\b/,
  /\bdivision\b/,
  /\bdepartment\b/,
  /\bregion\b/,
];

function normalizeCategoryFamily(categoryLabel: string): CategoryFamily | null {
  const category = categoryLabel.toLowerCase();
  if (SUPPORT_OPERATIONS_CATEGORY_PATTERNS.some((pattern) => pattern.test(category))) {
    return "support_operations";
  }
  if (CHANGE_LEADERSHIP_CATEGORY_PATTERNS.some((pattern) => pattern.test(category))) {
    return "change_leadership";
  }
  if (LEADERSHIP_SCOPE_CATEGORY_PATTERNS.some((pattern) => pattern.test(category))) {
    return "leadership_scope";
  }
  return null;
}

function hasSupportOperationsEvidence(evidenceText: string): boolean {
  return (
    SUPPORT_OPERATIONS_EVIDENCE_PATTERNS.some((pattern) => pattern.test(evidenceText)) &&
    /\b(led|leading|managed|owned|built|improved|scaled|optimized|directed|supervised|drove|orchestrated)\b/.test(
      evidenceText,
    )
  );
}

function hasChangeLeadershipEvidence(evidenceText: string): boolean {
  return (
    CHANGE_LEADERSHIP_EVIDENCE_PATTERNS.some((pattern) => pattern.test(evidenceText)) &&
    /\b(led|leading|managed|owned|drove|directed|supervised|orchestrated|championed|spearheaded)\b/.test(
      evidenceText,
    )
  );
}

function hasLeadershipScopeEvidence(evidenceText: string): boolean {
  return (
    /\b(led|leading|managed|owned|directed|supervised|built|drove|orchestrated|championed|spearheaded)\b/.test(
      evidenceText,
    ) && LEADERSHIP_SCOPE_EVIDENCE_PATTERNS.some((pattern) => pattern.test(evidenceText))
  );
}

function categoryAlreadySupported(input: {
  categoryLabel: string;
  evidenceText: string;
}): boolean {
  const family = normalizeCategoryFamily(input.categoryLabel);
  if (!family) return false;

  if (family === "support_operations") {
    return hasSupportOperationsEvidence(input.evidenceText);
  }

  if (family === "change_leadership") {
    return hasChangeLeadershipEvidence(input.evidenceText) || hasLeadershipScopeEvidence(input.evidenceText);
  }

  return hasLeadershipScopeEvidence(input.evidenceText);
}

function hasStrongEvidenceSignals(signals: string[]): boolean {
  const text = signals.join(" ").toLowerCase();
  const leadershipIndicators = /\b(led|leading|managed|managed a|managed the|managed team|built|owned|owned the|supervised|directed)\b/i;
  const scopeIndicators = /\b(team of \d+|\d+\+|across \d+|org(?:anization)?-?wide|global|enterprise|multi-site|cross-functional|portfolio|division|department|region)\b/i;
  const quantitativeIndicators = /\b(\d+%|\$[\d,.]+|\d+x|\d+\s?(?:people|teams|sites|markets|regions|customers|tickets|agents|ops|sla|kpi|okr))\b/i;
  const confidenceIndicators = /\b(high confidence|confirmed|verified|strong evidence|demonstrated|proven)\b/i;
  const matchedIndicators =
    Number(leadershipIndicators.test(text)) +
    Number(scopeIndicators.test(text)) +
    Number(quantitativeIndicators.test(text)) +
    Number(confidenceIndicators.test(text));

  return signals.length >= 3 || matchedIndicators >= 2;
}

export function shouldSuppressCategorySuggestion(input: {
  categoryLabel: string;
  supportingSignals?: unknown;
  baselineEvidence?: unknown;
  summary?: unknown;
}): boolean {
  const baselineEvidence = cleanText(input.baselineEvidence);
  const summary = cleanText(input.summary);
  const supportingSignals = cleanList(input.supportingSignals);
  const evidenceText = [baselineEvidence, summary, ...supportingSignals].join(" ").toLowerCase();

  if (!evidenceText) return false;

  if (categoryAlreadySupported({ categoryLabel: input.categoryLabel, evidenceText })) return true;
  return hasStrongEvidenceSignals(supportingSignals) && Boolean(baselineEvidence);
}

export function buildEvidenceSuggestion(input: {
  requirement: string;
  supportingSignals: unknown;
  baselineEvidence: unknown;
}): EvidenceSuggestion | null {
  const requirement = normalizeUserFacingRequirementLabel(input.requirement, {
    sourceContext: null,
    issueCode: "unsupported_technology_claim",
  });
  if (!requirement) return null;

  const supportingSignals = cleanList(input.supportingSignals);
  const baselineEvidence = cleanText(input.baselineEvidence);
  if (!supportingSignals.length && !baselineEvidence) return null;
  if (
    categoryAlreadySupported({
      categoryLabel: requirement,
      evidenceText: [baselineEvidence, ...supportingSignals].join(" ").toLowerCase(),
    })
  ) {
    return null;
  }
  if (hasStrongEvidenceSignals(supportingSignals) && baselineEvidence) return null;

  const groundedSignals = supportingSignals.slice(0, 4);
  const groundedSignalSummary = sentenceFromSignals(groundedSignals);
  const context = groundedSignals.length
    ? `We found this in your experience: ${groundedSignalSummary}`
    : "We found this in your verified baseline evidence";
  const description = groundedSignals.length
    ? "Confirm or refine this example so we keep it anchored to your actual work."
    : "Confirm or refine this example so we keep it anchored to your actual work.";
  const scope = baselineEvidence
    ? `Example anchor: ${baselineEvidence.slice(0, 180)}`
    : "Example anchor: verified support process and customer operations outcomes.";

  return {
    requirement,
    intro: `Based on your experience, we found a likely example for ${requirement}.`,
    context,
    description,
    scope,
    groundedSignals,
  };
}

export function buildBaselineEvidencePreview(input: {
  baselineEvidence?: unknown;
  supportingSignals?: unknown;
  summary?: unknown;
}): BaselineEvidencePreview | null {
  const supportingSignals = cleanList(input.supportingSignals).slice(0, 2);
  const baselineEvidence = cleanText(input.baselineEvidence);
  const summary = cleanText(input.summary);
  const signals = supportingSignals.length
    ? supportingSignals
    : baselineEvidence
      ? [baselineEvidence.slice(0, 180)]
      : summary
        ? [summary]
        : [];

  if (!signals.length) return null;
  return {
    intro: "We found this in your experience - confirm or refine it.",
    signals,
  };
}

export function buildRequirementGapInsight(input: {
  requirement: string;
  requirementEvidence?: unknown;
  baselineEvidence?: unknown;
  supportingSignals?: unknown;
  summary?: unknown;
}): RequirementGapInsight | null {
  const requirement = normalizeUserFacingRequirementLabel(input.requirement, {
    sourceContext: null,
    issueCode: "unsupported_technology_claim",
  });
  if (!requirement) return null;

  const roleExpectation = cleanText(input.requirementEvidence) || `This role expects ${requirement.toLowerCase()}.`;
  const baselineEvidence = cleanText(input.baselineEvidence);
  const supportingSignals = cleanList(input.supportingSignals);
  const summary = cleanText(input.summary);
  const evidenceText = [baselineEvidence, summary, ...supportingSignals].join(" ").toLowerCase();
  if (
    categoryAlreadySupported({
      categoryLabel: requirement,
      evidenceText,
    })
  ) {
    return null;
  }
  const currentSignal =
    baselineEvidence ||
    sentenceFromSignals(supportingSignals.slice(0, 3)) ||
    summary ||
    "Verified baseline evidence is still thin here.";

  const explanation = baselineEvidence
    ? `Your ${requirement.toLowerCase()} evidence is strong, but this role requires ${roleExpectation.toLowerCase()}.`
    : `You mentioned ${currentSignal.toLowerCase()}, so confirm one example of this work and we can keep it anchored to the baseline.`;

  return {
    requirement,
    currentSignal,
    roleExpectation,
    explanation,
    scope: roleExpectation,
  };
}

export function buildRequirementGapDelta(input: {
  requirement: string;
  requirementEvidence?: unknown;
  baselineEvidence?: unknown;
  supportingSignals?: unknown;
  summary?: unknown;
}): RequirementGapInsight | null {
  return buildRequirementGapInsight(input);
}

export type StrengtheningSuggestion = {
  requirement: string;
  action: string;
  rationale: string;
  nextStep: string;
  priority: number;
};

export type ActionableImprovementSuggestion = {
  requirement: string;
  action: string;
  priority: number;
};

function prioritizeRequirement(requirement: string): number {
  const normalized = requirement.toLowerCase();
  if (/\b(leadership|scope|ownership|team size|org scope)\b/.test(normalized)) return 1;
  if (/\b(metric|metrics|impact|outcome|results?)\b/.test(normalized)) return 2;
  if (/\b(incident|escalation|support operations|support process|service delivery)\b/.test(normalized)) return 3;
  if (/\b(platform|tool|tooling|salesforce|zendesk|jira|servicenow|crm)\b/.test(normalized)) return 4;
  return 5;
}

function actionForRequirement(requirement: string): string {
  const normalized = requirement.toLowerCase();
  if (/\b(leadership|scope|ownership|team size|org scope)\b/.test(normalized)) {
    return "You mentioned managing teams or scope, so confirm one example with team size or ownership.";
  }
  if (/\b(metric|metrics|impact|outcome|results?)\b/.test(normalized)) {
    return "You mentioned measurable impact, so confirm one example with numbers or outcomes.";
  }
  if (/\b(incident|escalation|support operations|support process|service delivery)\b/.test(normalized)) {
    return "You mentioned support operations, so confirm one example of incident, escalation, or workflow ownership.";
  }
  if (/\b(platform|tool|tooling|salesforce|zendesk|jira|servicenow|crm)\b/.test(normalized)) {
    return `You mentioned ${requirement}, so confirm one example of hands-on use.`;
  }
  return `Strengthen verified evidence for ${requirement}.`;
}

export function buildStrengtheningSuggestion(input: {
  requirement: string;
  requirementEvidence?: unknown;
  baselineEvidence?: unknown;
  supportingSignals?: unknown;
  summary?: unknown;
}): StrengtheningSuggestion | null {
  const gap = buildRequirementGapInsight(input);
  if (!gap) return null;
  return {
    requirement: gap.requirement,
    action: actionForRequirement(gap.requirement),
    rationale: gap.explanation,
    nextStep: "Run Fit Review to strengthen this gap.",
    priority: prioritizeRequirement(gap.requirement),
  };
}

export function buildActionableImprovementSuggestion(input: {
  requirement: string;
}): ActionableImprovementSuggestion | null {
  const requirement = normalizeUserFacingRequirementLabel(input.requirement, {
    sourceContext: null,
    issueCode: "unsupported_technology_claim",
  });
  if (!requirement) return null;
  return {
    requirement,
    action: actionForRequirement(requirement),
    priority: prioritizeRequirement(requirement),
  };
}

