import { normalizeUserFacingRequirementLabel } from "@/lib/generationReadiness";
import { FALLBACK_RENDERED_TEXT, sanitizeRenderedTextList, sanitizeRenderedTextValue } from "@/lib/renderedText";
import type { ScoreBreakdown, ScoreBreakdownDimensionKey } from "@/lib/evidenceLines";
import { fitReviewDimensionLabels } from "@/lib/fitReviewQuestions";

export type FitReviewGapAnalysis = {
  criticalGaps?:
    | Array<
        | string
        | {
            title?: string | null;
            requirementEvidence?: string | null;
            baselineEvidence?: string | null;
          }
      >
    | null;
  unverifiedRequirements?: string[] | null;
};

export type FitReviewResolvedGap = {
  dimension: string;
  reason: string;
  missingEvidence: string[];
  suggestedAction: string;
};

export type FitReviewResolvedGaps = {
  primaryGap: FitReviewResolvedGap;
  secondaryGaps: FitReviewResolvedGap[];
};

const TOOLING_PATTERNS = [
  /\btool(?:s|ing)?\b/i,
  /\bplatform\b/i,
  /\bsystem(?:s)?\b/i,
  /\bcrm\b/i,
  /\bticket(?:ing)?\b/i,
  /\bzendesk\b/i,
  /\bsalesforce\b/i,
  /\bservice\s?now\b/i,
  /\bservicenow\b/i,
  /\bjira\b/i,
  /\bfive9\b/i,
  /\btalkdesk\b/i,
];

const INDUSTRY_PATTERNS = [
  /\bindustry\b/i,
  /\bhealthcare\b/i,
  /\bfintech\b/i,
  /\binsurance\b/i,
  /\bregulated\b/i,
  /\bcompliance\b/i,
  /\bhipaa\b/i,
  /\bsoc2\b/i,
  /\bpci\b/i,
];

const LEADERSHIP_PATTERNS = [
  /\blead(?:ership|ing)\b/i,
  /\bseniority\b/i,
  /\bteam\b/i,
  /\bmanager\b/i,
  /\bdirect reports?\b/i,
  /\bheadcount\b/i,
  /\bscope\b/i,
  /\bownership\b/i,
];

const OPERATIONS_PATTERNS = [
  /\bsupport operations?\b/i,
  /\bservice delivery\b/i,
  /\bworkflow\b/i,
  /\bescalation\b/i,
  /\bincident\b/i,
  /\bsla\b/i,
  /\btriage\b/i,
  /\bqueue\b/i,
  /\bprocess\b/i,
];

const CHANGE_PATTERNS = [
  /\bchange\b/i,
  /\btransformation\b/i,
  /\badvoca(?:cy|te)\b/i,
  /\bstakeholder\b/i,
  /\bcustomer\b/i,
  /\bvoice of the customer\b/i,
  /\binfluence\b/i,
  /\brollout\b/i,
  /\badoption\b/i,
];

function cleanRequirement(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const sanitized = sanitizeRenderedTextValue(value, {
    endpoint: "fitReviewResolver",
    field: "requirement",
  });
  if (!sanitized || sanitized === FALLBACK_RENDERED_TEXT) return null;
  const normalized =
    normalizeUserFacingRequirementLabel(sanitized, {
      sourceContext: "fit_review",
      issueCode: "unsupported_technology_claim",
    }) ?? sanitized;
  return normalized.trim() ? normalized.trim() : null;
}

function classifyRequirementDimension(text: string): ScoreBreakdownDimensionKey {
  if (TOOLING_PATTERNS.some((pattern) => pattern.test(text))) return "tooling_and_platform_experience";
  if (INDUSTRY_PATTERNS.some((pattern) => pattern.test(text))) return "domain_and_business_context";
  if (LEADERSHIP_PATTERNS.some((pattern) => pattern.test(text))) return "role_scope_and_seniority";
  if (OPERATIONS_PATTERNS.some((pattern) => pattern.test(text))) return "support_operations_and_process_rigor";
  if (CHANGE_PATTERNS.some((pattern) => pattern.test(text))) return "change_leadership_and_customer_advocacy";
  return "support_operations_and_process_rigor";
}

function buildActionableDimensionSet(scoreBreakdown?: ScoreBreakdown | null): Set<ScoreBreakdownDimensionKey> {
  if (!scoreBreakdown?.dimensions?.length) return new Set();
  const ranked = scoreBreakdown.dimensions
    .filter((dimension) => dimension && typeof dimension.key === "string")
    .map((dimension) => ({
      key: dimension.key,
      percent: dimension.weight > 0 ? (dimension.score / dimension.weight) * 100 : Infinity,
    }))
    .filter((dimension) => Number.isFinite(dimension.percent))
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 2)
    .map((dimension) => dimension.key);

  return new Set(ranked);
}

function dimensionPercentMap(scoreBreakdown?: ScoreBreakdown | null): Record<string, number> {
  if (!scoreBreakdown?.dimensions?.length) return {};
  return scoreBreakdown.dimensions.reduce<Record<string, number>>((acc, dimension) => {
    acc[dimension.key] = dimension.weight > 0 ? (dimension.score / dimension.weight) * 100 : 0;
    return acc;
  }, {});
}

function pickPrimaryDimension(input: {
  actionableKeys: Set<ScoreBreakdownDimensionKey>;
  percentMap: Record<string, number>;
  hasEvidenceFor: (dimension: ScoreBreakdownDimensionKey) => boolean;
}): ScoreBreakdownDimensionKey {
  const actionable = Array.from(input.actionableKeys);
  const candidates = actionable.length
    ? actionable
    : (Object.keys(fitReviewDimensionLabels) as ScoreBreakdownDimensionKey[]);

  const tooling = "tooling_and_platform_experience" as const;
  const industry = "domain_and_business_context" as const;

  if (candidates.includes(tooling) && input.hasEvidenceFor(tooling)) return tooling;
  if (candidates.includes(industry) && input.hasEvidenceFor(industry)) return industry;
  if (candidates.includes(tooling)) return tooling;
  if (candidates.includes(industry)) return industry;

  return candidates
    .map((key, index) => ({
      key,
      percent: typeof input.percentMap[key] === "number" ? input.percentMap[key] : Infinity,
      index,
    }))
    .sort((a, b) => a.percent - b.percent || a.index - b.index)[0]?.key ?? tooling;
}

function buildGapCopy(dimensionLabel: string, missingEvidence: string[]) {
  const evidenceSnippet = missingEvidence.slice(0, 2).join(" or ");
  const normalizedDimensionLabel = dimensionLabel.toLowerCase();
  const isDomainAlignment = normalizedDimensionLabel.includes("domain alignment");

  const reason = isDomainAlignment
    ? "We couldn't verify enough experience aligned to this role’s domain."
    : evidenceSnippet
      ? `We couldn't verify enough evidence for ${evidenceSnippet}.`
      : `We couldn't verify enough evidence for ${normalizedDimensionLabel}.`;

  const suggestedAction = isDomainAlignment
    ? evidenceSnippet
      ? `Add one verified example showing experience in ${evidenceSnippet} or similar environments.`
      : "Add one verified example that clearly shows experience in this type of environment or domain."
    : evidenceSnippet
      ? `Add one verified example of ${evidenceSnippet}.`
      : "Add one verified example to strengthen this dimension.";
  return { reason, suggestedAction };
}

export function resolveFitReviewGaps(input: {
  gapAnalysis: FitReviewGapAnalysis | null | undefined;
  scoreBreakdown?: ScoreBreakdown | null;
}): FitReviewResolvedGaps {
  const unverifiedRequirements = Array.isArray(input.gapAnalysis?.unverifiedRequirements)
    ? sanitizeRenderedTextList(input.gapAnalysis?.unverifiedRequirements, {
        endpoint: "fitReviewResolver",
        field: "gapAnalysis.unverifiedRequirements",
      })
        .map((req) => cleanRequirement(req))
        .filter((req): req is string => Boolean(req))
    : [];

  const criticalGapRequirements = Array.isArray(input.gapAnalysis?.criticalGaps)
    ? input.gapAnalysis.criticalGaps
        .map((gap) => {
          if (typeof gap === "string") return cleanRequirement(gap);
          if (gap && typeof gap === "object") {
            return cleanRequirement(gap.title ?? gap.requirementEvidence ?? null);
          }
          return null;
        })
        .filter((req): req is string => Boolean(req))
    : [];

  const requirements = [...unverifiedRequirements, ...criticalGapRequirements].filter(Boolean);
  const uniqueRequirements = Array.from(new Set(requirements.map((req) => req.trim()))).filter(Boolean);

  const evidenceByDimension: Record<ScoreBreakdownDimensionKey, string[]> = {
    role_scope_and_seniority: [],
    support_operations_and_process_rigor: [],
    tooling_and_platform_experience: [],
    domain_and_business_context: [],
    change_leadership_and_customer_advocacy: [],
  };

  for (const requirement of uniqueRequirements) {
    const dimension = classifyRequirementDimension(requirement);
    evidenceByDimension[dimension].push(requirement);
  }

  const actionableKeys = buildActionableDimensionSet(input.scoreBreakdown);
  const percentMap = dimensionPercentMap(input.scoreBreakdown);
  const hasEvidenceFor = (dimension: ScoreBreakdownDimensionKey) => evidenceByDimension[dimension].length > 0;
  const primaryDimensionKey = pickPrimaryDimension({ actionableKeys, percentMap, hasEvidenceFor });

  const primaryLabel = fitReviewDimensionLabels[primaryDimensionKey];
  const primaryMissing = evidenceByDimension[primaryDimensionKey].slice(0, 3);
  const primaryCopy = buildGapCopy(primaryLabel, primaryMissing);

  const secondaryDimensionKeys = (
    actionableKeys.size
      ? Array.from(actionableKeys)
      : (Object.keys(fitReviewDimensionLabels) as ScoreBreakdownDimensionKey[])
  ).filter((key) => key !== primaryDimensionKey);

  const secondaryGaps: FitReviewResolvedGap[] = secondaryDimensionKeys
    .map((dimensionKey) => {
      const label = fitReviewDimensionLabels[dimensionKey];
      const missing = evidenceByDimension[dimensionKey].slice(0, 3);
      const copy = buildGapCopy(label, missing);
      return {
        dimension: label,
        reason: copy.reason,
        missingEvidence: missing,
        suggestedAction: copy.suggestedAction,
      };
    })
    .filter((gap) => gap.missingEvidence.length > 0)
    .slice(0, 3);

  return {
    primaryGap: {
      dimension: primaryLabel,
      reason: primaryCopy.reason,
      missingEvidence: primaryMissing,
      suggestedAction: primaryCopy.suggestedAction,
    },
    secondaryGaps,
  };
}
