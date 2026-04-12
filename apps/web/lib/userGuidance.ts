import { normalizeUserFacingRequirementLabel } from "@/lib/generationReadiness";
import {
  FALLBACK_RENDERED_TEXT,
  sanitizeRenderedTextValue,
} from "@/lib/renderedText";

export type UserGuidanceCard = {
  title: string;
  description: string;
  whyItMatters?: string;
  actionLabel?: string;
  examplePrompt?: string;
};

type GapGuidanceInput = {
  requirement?: unknown;
  categoryLabel?: unknown;
  domainLabel?: unknown;
  confidenceLabel?: unknown;
  currentSignal?: unknown;
  roleExpectation?: unknown;
  explanation?: unknown;
  baselineEvidence?: unknown;
  supportingSignals?: unknown;
  summary?: unknown;
  fallbackTitle?: string;
  fallbackDescription?: string;
};

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = sanitizeRenderedTextValue(value, {
    endpoint: "userGuidance",
    field: "cleanText",
  });
  return cleaned === FALLBACK_RENDERED_TEXT ? "" : cleaned;
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => cleanText(value))
    .filter(Boolean);
}

function sentenceFromSignals(signals: string[]): string {
  const top = signals.slice(0, 3);
  if (!top.length) return "";
  if (top.length === 1) return top[0];
  if (top.length === 2) return `${top[0]} and ${top[1]}`;
  return `${top[0]}, ${top[1]}, and ${top[2]}`;
}

function normalizeRequirementLabel(value: unknown): string | null {
  const label =
    normalizeUserFacingRequirementLabel(cleanText(value), {
      sourceContext: null,
      issueCode: "unsupported_technology_claim",
    }) ?? null;
  if (!label) return null;
  const lowered = label.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(label)) return null;
  if (/\b(category|domain|confidence|gap id|gap)\b/i.test(lowered)) return null;
  return label;
}

function deriveTopic(requirement: string): "scope" | "outcome" | "tool" | "process" | "context" | "generic" {
  const lowered = requirement.toLowerCase();
  if (/\b(leadership|scope|ownership|team|seniority|scale)\b/.test(lowered)) return "scope";
  if (/\b(metric|metrics|impact|outcome|results?)\b/.test(lowered)) return "outcome";
  if (/\b(tool|system|platform|software|salesforce|zendesk|servicenow|jira|crm)\b/.test(lowered)) {
    return "tool";
  }
  if (/\b(process|workflow|operations|support|service delivery|escalation|incident)\b/.test(lowered)) {
    return "process";
  }
  if (/\b(context|customer|audience|stakeholder|environment)\b/.test(lowered)) return "context";
  return "generic";
}

function titleForTopic(topic: ReturnType<typeof deriveTopic>): string {
  switch (topic) {
    case "scope":
      return "Clarify the scope";
    case "outcome":
      return "Show the outcome";
    case "tool":
      return "Clarify the tool or system";
    case "process":
      return "Add context to this example";
    case "context":
      return "Add context to this example";
    default:
      return "Clarify this example";
  }
}

function descriptionForTopic(topic: ReturnType<typeof deriveTopic>, requirement: string): string {
  const detail = requirement ? `about ${requirement.toLowerCase()}` : "from your real experience";
  switch (topic) {
    case "scope":
      return `Explain how large the effort was, what you owned, and who was involved ${detail}.`;
    case "outcome":
      return `Describe the action you took and the measurable result ${detail}.`;
    case "tool":
      return `Explain how you used the tool or system and what changed because of it ${detail}.`;
    case "process":
      return `Describe the situation, what you did, and the result ${detail}.`;
    case "context":
      return `Add a concrete example that shows the surrounding situation and your role ${detail}.`;
    default:
      return "Add a specific example from your real experience that supports this requirement.";
  }
}

function whyItMattersForTopic(topic: ReturnType<typeof deriveTopic>): string {
  switch (topic) {
    case "scope":
      return "This helps Studio understand the scale and ownership behind the example.";
    case "outcome":
      return "This helps Studio keep the example grounded in a measurable result.";
    case "tool":
      return "This helps Studio connect the example to the system or tool the role expects.";
    case "process":
      return "This helps Studio anchor the example in a real workflow, not a vague claim.";
    case "context":
      return "This helps Studio understand the situation and why the example matters.";
    default:
      return "This helps Studio stay anchored to your real experience.";
  }
}

function promptForTopic(topic: ReturnType<typeof deriveTopic>, requirement: string): string {
  const detail = requirement ? requirement.toLowerCase() : "this requirement";
  switch (topic) {
    case "scope":
      return `Describe one example showing how much scope you owned for ${detail}.`;
    case "outcome":
      return `Describe one example showing the outcome you created for ${detail}.`;
    case "tool":
      return `Describe one example showing how you used the tool or system for ${detail}.`;
    case "process":
      return `Describe one example showing the workflow or process you improved for ${detail}.`;
    case "context":
      return `Describe one example with enough context for ${detail}.`;
    default:
      return "Describe one specific example from your work, including what you did and what changed.";
  }
}

export function mapGapToUserGuidance(input: GapGuidanceInput): UserGuidanceCard {
  const requirement =
    normalizeRequirementLabel(input.requirement) ??
    normalizeRequirementLabel(input.categoryLabel) ??
    normalizeRequirementLabel(input.domainLabel) ??
    "";
  const supportingSignals = cleanList(input.supportingSignals);
  const baselineEvidence = cleanText(input.baselineEvidence);
  const summary = cleanText(input.summary);
  const currentSignal = cleanText(input.currentSignal);
  const roleExpectation = cleanText(input.roleExpectation);
  const explanation = cleanText(input.explanation);
  const topic = requirement ? deriveTopic(requirement) : "generic";
  const title =
    sanitizeRenderedTextValue(input.fallbackTitle?.trim() || titleForTopic(topic), {
      endpoint: "userGuidance",
      field: "title",
    }) || titleForTopic(topic);
  const fallbackDescription =
    input.fallbackDescription?.trim() || "Add a specific example from your real experience that supports this requirement.";

  const description =
    requirement ? descriptionForTopic(topic, requirement) : fallbackDescription;
  const whyItMatters =
    roleExpectation ||
    currentSignal ||
    baselineEvidence ||
    summary ||
    explanation ||
    supportingSignals.length
      ? whyItMattersForTopic(topic)
      : undefined;
  const examplePrompt = promptForTopic(topic, requirement || input.fallbackTitle || "this requirement");

  return {
    title,
    description: sanitizeRenderedTextValue(description, {
      endpoint: "userGuidance",
      field: "description",
    }),
    whyItMatters: whyItMatters
      ? sanitizeRenderedTextValue(whyItMatters, {
          endpoint: "userGuidance",
          field: "whyItMatters",
        })
      : undefined,
    actionLabel: "Add example",
    examplePrompt: sanitizeRenderedTextValue(examplePrompt, {
      endpoint: "userGuidance",
      field: "examplePrompt",
    }),
  };
}
