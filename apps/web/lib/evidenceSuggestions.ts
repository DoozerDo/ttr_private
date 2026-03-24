import { normalizeUserFacingRequirementLabel } from "@/lib/generationReadiness";

export type EvidenceSuggestion = {
  requirement: string;
  intro: string;
  context: string;
  description: string;
  scope: string;
  groundedSignals: string[];
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

