import { normalizeUserFacingRequirementLabel } from "@/lib/generationReadiness";

export type EvidenceSuggestion = {
  requirement: string;
  intro: string;
  context: string;
  description: string;
  scope: string;
  groundedSignals: string[];
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
  const category = input.categoryLabel.toLowerCase();
  const baselineEvidence = cleanText(input.baselineEvidence);
  const summary = cleanText(input.summary);
  const supportingSignals = cleanList(input.supportingSignals);
  const evidenceText = [baselineEvidence, summary, ...supportingSignals].join(" ").toLowerCase();

  if (!evidenceText) return false;

  const leadershipCategory = /\bleadership\b|\bseniority\b/.test(category);
  const supportOpsCategory = /\bsupport operations?\b|\boperations\b/.test(category);
  const strongLeadershipEvidence =
    /\b(led|leading|managed|owned|directed|supervised)\b/.test(evidenceText) &&
    /\b(team of \d+|\d+\+|across \d+|org(?:anization)?-?wide|global|enterprise|multi-site|cross-functional|portfolio|division|department|region)\b/.test(
      evidenceText,
    );
  const strongOpsEvidence =
    /\b(support operations?|process ownership|workflow|sla|kpi|incident|escalation|service delivery)\b/.test(
      evidenceText,
    ) &&
    /\b(led|managed|owned|built|improved|scaled|optimized)\b/.test(evidenceText);

  if (leadershipCategory && strongLeadershipEvidence) return true;
  if (supportOpsCategory && strongOpsEvidence) return true;
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
  if (hasStrongEvidenceSignals(supportingSignals) && baselineEvidence) return null;

  const groundedSignals = supportingSignals.slice(0, 4);
  const groundedSignalSummary = sentenceFromSignals(groundedSignals);
  const context = groundedSignals.length
    ? `Role context aligned with ${groundedSignalSummary}`
    : "Role context aligned with verified baseline evidence";
  const description = groundedSignals.length
    ? `Executed support workflows tied to ${groundedSignalSummary}, with defensible operational ownership in existing baseline evidence.`
    : `Executed support workflows and operational processes already reflected in verified baseline evidence.`;
  const scope = baselineEvidence
    ? `Impact evidence anchor: ${baselineEvidence.slice(0, 180)}`
    : "Impact reflected in verified support process and customer operations outcomes.";

  return {
    requirement,
    intro: `Based on your experience, we suggest evidence for ${requirement} grounded in your verified baseline signals.`,
    context,
    description,
    scope,
    groundedSignals,
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
  const currentSignal =
    baselineEvidence ||
    sentenceFromSignals(supportingSignals.slice(0, 3)) ||
    summary ||
    "Verified baseline evidence is still thin here.";

  const explanation = baselineEvidence
    ? `Your ${requirement.toLowerCase()} evidence is strong, but this role requires ${roleExpectation.toLowerCase()}.`
    : `This role requires ${roleExpectation.toLowerCase()} and the selected resume evidence does not fully show it yet.`;

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

