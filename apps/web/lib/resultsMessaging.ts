import type {
  GenerationProductConfidence,
  GenerationProductReadinessState,
} from "@/lib/generationProductReadiness";
import { normalizeUserFacingRequirementLabel } from "@/lib/generationReadiness";
import { FALLBACK_RENDERED_TEXT, sanitizeRenderedTextValue } from "@/lib/renderedText";

type ResultsScoreInput = {
  score: number | null;
};

type ResultsReadinessInput = {
  state: GenerationProductReadinessState;
  confidence: GenerationProductConfidence;
  needsVerification: boolean;
};

export type ResultsDecisionCopy = {
  headline: string;
  subtext: string;
};

export type ResultsBlockedDriver = {
  id: string;
  title: string;
  detail: string;
  actionLabel: string;
  actionHref: string;
};

export type ResultsBlockedState = ResultsDecisionCopy & {
  fitLabel: "Strong fit" | "Competitive fit";
  body: string;
  supportSummary: string;
  drivers: ResultsBlockedDriver[];
  primaryActionLabel: string;
  primaryActionHref: string;
  secondaryActionLabel: string;
  secondaryActionHref: string;
  trustLine: string;
};

type BlockedSource = {
  title?: string | null;
  requirementEvidence?: string | null;
  baselineEvidence?: string | null;
  severityScore?: number | null;
};

type BuildBlockedStateInput = ResultsScoreInput & {
  fitReviewHref: string;
  secondaryActionHref: string;
  criticalGaps?: BlockedSource[] | null;
  unverifiedRequirements?: string[] | null;
};

type RankedBlockedSource = {
  title: string;
  requirementEvidence: string;
  baselineEvidence: string;
  severityScore: number;
  source: "critical_gap" | "unverified_requirement";
};

const LEADERSHIP_SCOPE_PATTERNS = [
  /\bleadership\b/i,
  /\bscope\b/i,
  /\bteam size\b/i,
  /\bownership span\b/i,
  /\boperational scope\b/i,
  /\bpeople leadership\b/i,
];

const INCIDENT_OWNERSHIP_PATTERNS = [
  /\bincident\b/i,
  /\bescalation\b/i,
  /\btriage\b/i,
  /\brestoration\b/i,
  /\bproblem management\b/i,
  /\boutage\b/i,
  /\bon-call\b/i,
  /\bresponse\b/i,
];

const MEASURED_OUTCOMES_PATTERNS = [
  /\bmetric\b/i,
  /\bmetrics\b/i,
  /\bmeasured\b/i,
  /\boutcome\b/i,
  /\boutcomes\b/i,
  /\bresult\b/i,
  /\bresults\b/i,
  /\bimpact\b/i,
  /\bkpi\b/i,
  /\bokr\b/i,
];

const PROCESS_OWNERSHIP_PATTERNS = [
  /\bprocess\b/i,
  /\bworkflow\b/i,
  /\boperating rhythm\b/i,
  /\bservice delivery\b/i,
  /\bsupport operations\b/i,
  /\boperational rigor\b/i,
];

function compactText(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const cleaned = sanitizeRenderedTextValue(value, {
    endpoint: "resultsMessaging",
    field: "compactText",
  });
  return cleaned === FALLBACK_RENDERED_TEXT ? "" : cleaned;
}

function fitLabelForScore(score: number | null): ResultsBlockedState["fitLabel"] {
  if (typeof score === "number" && Number.isFinite(score) && score >= 80) {
    return "Strong fit";
  }
  return "Competitive fit";
}

function classifyBlockedDetail(text: string, hasBaselineEvidence: boolean): string {
  if (LEADERSHIP_SCOPE_PATTERNS.some((pattern) => pattern.test(text))) {
    return "Clarify team size, ownership span, or operational scope.";
  }
  if (INCIDENT_OWNERSHIP_PATTERNS.some((pattern) => pattern.test(text))) {
    return "Clarify your role in escalation, triage, restoration, or problem management.";
  }
  if (MEASURED_OUTCOMES_PATTERNS.some((pattern) => pattern.test(text))) {
    return "Add metrics or concrete results tied to the work.";
  }
  if (PROCESS_OWNERSHIP_PATTERNS.some((pattern) => pattern.test(text))) {
    return "Clarify the systems, workflows, or operating rhythms you owned.";
  }
  return hasBaselineEvidence
    ? "Make the ownership and impact in this area explicit."
    : "Add one concrete example from your experience.";
}

function normalizeBlockedSource(
  source: BlockedSource,
  fallbackTitle: string,
  sourceType: RankedBlockedSource["source"],
): RankedBlockedSource {
  const title =
    sanitizeRenderedTextValue(
      normalizeUserFacingRequirementLabel(source.title ?? fallbackTitle, {
        sourceContext: null,
        issueCode: "unsupported_technology_claim",
      }) ?? compactText(source.title) ?? fallbackTitle,
      {
        endpoint: "resultsMessaging",
        field: "blockedSource.title",
      },
    );
  return {
    title,
    requirementEvidence: compactText(source.requirementEvidence),
    baselineEvidence: compactText(source.baselineEvidence),
    severityScore: typeof source.severityScore === "number" ? source.severityScore : 0,
    source: sourceType,
  };
}

function rankBlockedSources(input: BuildBlockedStateInput): RankedBlockedSource[] {
  const sources: RankedBlockedSource[] = [];
  const seen = new Set<string>();

  const criticalGaps = Array.isArray(input.criticalGaps) ? input.criticalGaps : [];
  const rankedCriticalGaps = criticalGaps
    .filter((gap): gap is BlockedSource => Boolean(gap))
    .map((gap, index) => normalizeBlockedSource(gap, `Profile gap ${index + 1}`, "critical_gap"))
    .sort((a, b) => b.severityScore - a.severityScore || a.title.localeCompare(b.title));

  for (const gap of rankedCriticalGaps) {
    const key = gap.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(gap);
  }

  const unverifiedRequirements = Array.isArray(input.unverifiedRequirements)
    ? input.unverifiedRequirements
    : [];
  for (const requirement of unverifiedRequirements) {
    const normalizedTitle =
      normalizeUserFacingRequirementLabel(requirement, {
        sourceContext: null,
        issueCode: "unsupported_technology_claim",
      }) ?? compactText(requirement);
    if (!normalizedTitle) continue;
    const key = normalizedTitle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      title: normalizedTitle,
      requirementEvidence: normalizedTitle,
      baselineEvidence: "",
      severityScore: 0,
      source: "unverified_requirement",
    });
  }

  return sources.slice(0, 3);
}

function buildBlockedDriver(source: RankedBlockedSource, index: number): ResultsBlockedDriver {
  const detail = classifyBlockedDetail(
    [source.title, source.requirementEvidence, source.baselineEvidence].filter(Boolean).join(" "),
    Boolean(source.baselineEvidence),
  );
  return {
    id: `blocked-driver-${index + 1}`,
    title: source.title,
    detail,
    actionLabel: "Start Fit Review",
    actionHref: "",
  };
}

export function buildResultsDecisionCopy(input: {
  score: number | null;
  generationReadiness: ResultsReadinessInput;
}): ResultsDecisionCopy {
  const fitLabel = fitLabelForScore(input.score);

  if (input.generationReadiness.state === "ALLOWED") {
    if (input.generationReadiness.confidence === "HIGH") {
      return {
        headline: "You're a strong match. You can generate now.",
        subtext: "Your profile grounding is strong enough to generate in Studio.",
      };
    }

    return {
      headline: "You're a strong match. You can generate now.",
      subtext: "Open Studio now. You can tighten a few details after generation.",
    };
  }

  if (input.generationReadiness.state === "BLOCKED") {
    return {
      headline: `${fitLabel}. One step left.`,
      subtext: "Use Fit Review to strengthen the specific areas below.",
    };
  }

  return {
    headline: "Strengthen your fit before generating.",
    subtext: "You are close, but improving alignment and evidence will significantly strengthen your materials.",
  };
}

export function buildCompetitiveBlockedResultsState(
  input: BuildBlockedStateInput,
): ResultsBlockedState {
  const fitLabel = fitLabelForScore(input.score);
  const copy = buildResultsDecisionCopy({
    score: input.score,
    generationReadiness: {
      state: "BLOCKED",
      confidence: "LOW",
      needsVerification: true,
    },
  });
  const rankedSources = rankBlockedSources(input);
  const drivers = rankedSources.map((source, index) => ({
    ...buildBlockedDriver(source, index),
    actionHref: input.fitReviewHref,
  }));

  return {
    fitLabel,
    headline: copy.headline,
    subtext: copy.subtext,
    body:
      "You are aligned with this role. Before Studio can generate, we need to strengthen a few profile details so the output stays accurate and defensible.",
    supportSummary:
      "Use Fit Review to strengthen the specific areas below.",
    drivers,
    primaryActionLabel: "Start Fit Review",
    primaryActionHref: input.fitReviewHref,
    secondaryActionLabel: "View top drivers",
    secondaryActionHref: input.secondaryActionHref,
    trustLine: "Studio stays locked until the story is grounded enough to defend the output.",
  };
}
