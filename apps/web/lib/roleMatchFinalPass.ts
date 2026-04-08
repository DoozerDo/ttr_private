import type { ResumeModel } from "@/app/(app)/studio/ResumePreview";

import {
  type DocumentStrategyPlan,
  REFINEMENT_PRESETS,
  type RefinementPreset,
} from "@/lib/documentStrategyPlan";

export type RoleMatchFinalPassPriorityCoverage = {
  priority: string;
  covered: boolean;
  strength: "strong" | "partial" | "missing";
  evidenceSource: string | null;
};

export type RoleMatchFinalPassKeywordAlignment = {
  strongMatches: string[];
  partialMatches: string[];
  missingButImportant: string[];
  stuffedOrExcessive: string[];
};

export type RoleMatchFinalPassRiskType =
  | "top_third_too_generic"
  | "missing_priority_signal"
  | "weak_keyword_presence"
  | "cover_letter_not_role_specific"
  | "proof_not_visible_early"
  | "theme_overload";

export type RoleMatchFinalPassRisk = {
  type: RoleMatchFinalPassRiskType;
  severity: "high" | "medium" | "low";
  explanation: string;
};

export type RoleMatchFinalAdjustmentType =
  | "summary_tighten"
  | "bullet_reorder"
  | "keyword_tighten"
  | "cover_letter_role_focus";

export type RoleMatchFinalAdjustment = {
  label: string;
  type: RoleMatchFinalAdjustmentType;
  target: "resume" | "cover_letter" | "both";
};

export type RoleMatchFinalPass = {
  overallMatchReadiness: "ready" | "needs_tightening" | "misaligned";
  priorityCoverage: RoleMatchFinalPassPriorityCoverage[];
  keywordAlignment: RoleMatchFinalPassKeywordAlignment;
  recruiterScanRisks: RoleMatchFinalPassRisk[];
  recommendedFinalAdjustments: RoleMatchFinalAdjustment[];
};

type RoleMatchFinalPassInput = {
  plan: DocumentStrategyPlan;
  resumeModel: ResumeModel | null;
  coverLetterParagraphs: string[];
  jobDescription?: string | null;
};

type TextBucket = {
  resumeSummary: string;
  resumeBullets: string[];
  coverOpening: string;
  coverBody: string[];
  resumeText: string;
  coverText: string;
  corpus: string;
};

const STOPWORDS = new Set([
  "the",
  "and",
  "with",
  "from",
  "into",
  "this",
  "that",
  "your",
  "you",
  "role",
  "job",
  "for",
  "our",
  "their",
  "must",
  "will",
  "have",
  "has",
  "been",
  "are",
  "was",
  "were",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "an",
  "a",
  "as",
  "or",
  "be",
  "we",
  "it",
  "via",
  "more",
  "less",
  "some",
  "any",
  "than",
  "across",
  "my",
  "me",
  "i",
]);

const GENERIC_PHRASES = [
  "results-driven",
  "proven track record",
  "dynamic leader",
  "passionate",
  "self-starter",
  "detail-oriented",
  "team player",
  "fast-paced",
  "world-class",
  "go-getter",
  "driven by outcomes",
  "delivered results",
];

const ACTION_VERBS = [
  "led",
  "built",
  "owned",
  "improved",
  "delivered",
  "implemented",
  "scaled",
  "reduced",
  "increased",
  "launched",
  "designed",
  "managed",
  "coordinated",
  "transformed",
  "optimized",
  "streamlined",
];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeLower(value)
    .split(/[^a-z0-9%]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
}

function joinText(values: string[]): string {
  return values.map(normalizeText).filter(Boolean).join(" ").trim();
}

function coverBodyParagraphs(paragraphs: string[]): string[] {
  return paragraphs
    .map(normalizeText)
    .filter(Boolean)
    .filter(
      (paragraph) =>
        !/^dear\b/i.test(paragraph) &&
        !/^(sincerely|regards|best|thanks|thank you)\b/i.test(paragraph),
    );
}

function resumeSummary(model: ResumeModel | null): string {
  return normalizeText(model?.summary ?? "");
}

function resumeBullets(model: ResumeModel | null): string[] {
  if (!model?.experience?.length) return [];
  return model.experience
    .flatMap((entry) => (Array.isArray(entry.bullets) ? entry.bullets : []))
    .map((bullet) => normalizeText(String(bullet ?? "")))
    .filter(Boolean);
}

function buildBuckets(input: RoleMatchFinalPassInput): TextBucket {
  const summary = resumeSummary(input.resumeModel);
  const bullets = resumeBullets(input.resumeModel);
  const cover = coverBodyParagraphs(input.coverLetterParagraphs);
  const coverOpening = cover[0] ?? "";
  const resumeText = joinText([summary, ...bullets]);
  const coverText = joinText(cover);
  return {
    resumeSummary: summary,
    resumeBullets: bullets,
    coverOpening,
    coverBody: cover,
    resumeText,
    coverText,
    corpus: joinText([resumeText, coverText]),
  };
}

function countMatches(text: string, needles: string[]): number {
  const normalized = normalizeLower(text);
  return needles.reduce((count, needle) => {
    if (!needle) return count;
    return normalized.includes(normalizeLower(needle)) ? count + 1 : count;
  }, 0);
}

function countOccurrences(text: string, needle: string): number {
  const normalized = normalizeLower(text);
  const normalizedNeedle = normalizeLower(needle);
  if (!normalizedNeedle) return 0;
  return normalized.split(normalizedNeedle).length - 1;
}

function countSentenceHits(text: string, needle: string): number {
  const normalizedNeedle = normalizeLower(needle);
  if (!normalizedNeedle) return 0;
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeLower(sentence))
    .filter((sentence) => sentence.includes(normalizedNeedle)).length;
}

function hasGenericLanguage(text: string): boolean {
  const normalized = normalizeLower(text);
  return GENERIC_PHRASES.some((phrase) => normalized.includes(phrase));
}

function hasRoleSpecificLanguage(text: string, priorities: string[]): boolean {
  const normalized = normalizeLower(text);
  return priorities.some((priority) => {
    const tokens = tokenize(priority).filter((token) => token.length > 3);
    return tokens.some((token) => normalized.includes(token));
  });
}

function priorityEvidenceSource(
  input: RoleMatchFinalPassInput,
  priority: string,
  buckets: TextBucket,
): string | null {
  const normalizedPriority = normalizeLower(priority);
  const summaryHit = normalizeLower(buckets.resumeSummary).includes(normalizedPriority);
  const bulletHit = buckets.resumeBullets.some((bullet) => normalizeLower(bullet).includes(normalizedPriority));
  const coverHit = normalizeLower(buckets.coverOpening).includes(normalizedPriority);
  if (summaryHit) return "resume summary";
  if (bulletHit) return "resume experience";
  if (coverHit) return "cover letter opening";

  const matchingEvidence = input.plan.selectedEvidence.find((evidence) => {
    const corpus = joinText([evidence.baselineSection, evidence.whySelected, ...evidence.matchedSignals]);
    return normalizeLower(corpus).includes(normalizedPriority);
  });
  return matchingEvidence?.baselineSection ?? null;
}

function evaluatePriorityCoverage(
  input: RoleMatchFinalPassInput,
  buckets: TextBucket,
): RoleMatchFinalPassPriorityCoverage[] {
  return input.plan.roleLens.priorities.slice(0, 5).map((priority) => {
    const normalizedPriority = normalizeLower(priority);
    const summaryHits = countSentenceHits(buckets.resumeSummary, priority) > 0 ? 1 : 0;
    const bulletHits = buckets.resumeBullets.filter((bullet) => normalizeLower(bullet).includes(normalizedPriority)).length;
    const coverHits = countSentenceHits(buckets.coverOpening, priority) > 0 ? 1 : 0;
    const evidenceHits = input.plan.selectedEvidence.filter((evidence) => {
      const evidenceText = joinText([evidence.baselineSection, evidence.whySelected, ...evidence.matchedSignals, ...evidence.approvedClaims]);
      return normalizeLower(evidenceText).includes(normalizedPriority);
    }).length;

    const totalHits = summaryHits + bulletHits + coverHits + evidenceHits;
    const strength: RoleMatchFinalPassPriorityCoverage["strength"] =
      totalHits >= 2 ? "strong" : totalHits === 1 ? "partial" : "missing";

    return {
      priority,
      covered: strength !== "missing",
      strength,
      evidenceSource: priorityEvidenceSource(input, priority, buckets),
    };
  });
}

function evaluateKeywordAlignment(
  input: RoleMatchFinalPassInput,
  buckets: TextBucket,
): RoleMatchFinalPassKeywordAlignment {
  const importantTerms = uniqueValues([
    ...input.plan.roleLens.targetKeywords,
    ...input.plan.roleLens.requiredSignals,
    ...input.plan.roleLens.priorities,
  ]).filter((term) => tokenize(term).some((token) => token.length > 3));

  const strongMatches: string[] = [];
  const partialMatches: string[] = [];
  const missingButImportant: string[] = [];
  const stuffedOrExcessive: string[] = [];

  for (const term of importantTerms) {
    const normalized = normalizeLower(term);
    const resumeCount = countOccurrences(buckets.resumeText, normalized);
    const coverCount = countOccurrences(buckets.coverText, normalized);
    const jobCount = countOccurrences(normalizeText(input.jobDescription ?? ""), normalized);
    const totalCount = resumeCount + coverCount;

    if (totalCount >= 2) {
      strongMatches.push(term);
    } else if (totalCount === 1 || jobCount > 0) {
      partialMatches.push(term);
    } else {
      missingButImportant.push(term);
    }

    const totalSentenceHits =
      countSentenceHits(buckets.resumeText, term) + countSentenceHits(buckets.coverText, term);
    if (totalCount >= 4 || (totalCount >= 3 && totalSentenceHits <= 2)) {
      stuffedOrExcessive.push(term);
    }
  }

  return {
    strongMatches: strongMatches.slice(0, 8),
    partialMatches: partialMatches.slice(0, 8),
    missingButImportant: missingButImportant.slice(0, 8),
    stuffedOrExcessive: stuffedOrExcessive.slice(0, 4),
  };
}

function determineTopThirdText(buckets: TextBucket): string {
  const topBullets = buckets.resumeBullets.slice(0, 2);
  return joinText([buckets.resumeSummary, ...topBullets, buckets.coverOpening]);
}

function detectRecruiterScanRisks(
  input: RoleMatchFinalPassInput,
  buckets: TextBucket,
  priorityCoverage: RoleMatchFinalPassPriorityCoverage[],
  keywordAlignment: RoleMatchFinalPassKeywordAlignment,
): RoleMatchFinalPassRisk[] {
  const topThird = determineTopThirdText(buckets);
  const hasGenericTopThird = hasGenericLanguage(topThird) || topThird.length < 90 || !hasRoleSpecificLanguage(topThird, input.plan.roleLens.priorities.slice(0, 3));
  const visiblePriorityCount = priorityCoverage.slice(0, 3).filter((entry) => entry.strength === "strong").length;
  const missingPriorityCount = priorityCoverage.slice(0, 3).filter((entry) => entry.strength === "missing").length;
  const topEvidenceVisibleEarly =
    countMatches(buckets.resumeSummary, [input.plan.selectedEvidence[0]?.baselineSection ?? ""]) > 0 ||
    countMatches(joinText(buckets.resumeBullets.slice(0, 2)), [input.plan.selectedEvidence[0]?.baselineSection ?? ""]) > 0 ||
    input.plan.selectedEvidence.length === 0;
  const coverRoleSpecific = hasRoleSpecificLanguage(buckets.coverOpening, input.plan.roleLens.priorities.slice(0, 3));
  const themeCount = new Set(
    [
      ...input.plan.roleLens.priorities,
      ...input.plan.roleLens.targetKeywords,
    ].filter((theme) => countMatches(topThird, [theme]) > 0),
  ).size;

  const risks: RoleMatchFinalPassRisk[] = [];
  if (hasGenericTopThird) {
    risks.push({
      type: "top_third_too_generic",
      severity: "high",
      explanation: "The top of the resume and the opening of the cover letter do not yet read as clearly role-shaped.",
    });
  }
  if (missingPriorityCount > 0 || visiblePriorityCount === 0) {
    risks.push({
      type: "missing_priority_signal",
      severity: missingPriorityCount > 1 ? "high" : "medium",
      explanation: "One or more top role priorities are not clearly visible early enough for a fast scan.",
    });
  }
  if (keywordAlignment.missingButImportant.length > 0 || keywordAlignment.strongMatches.length < 2) {
    risks.push({
      type: "weak_keyword_presence",
      severity: keywordAlignment.missingButImportant.length > 2 ? "high" : "medium",
      explanation: "Some important role language is still too faint or missing from the visible story.",
    });
  }
  if (!coverRoleSpecific) {
    risks.push({
      type: "cover_letter_not_role_specific",
      severity: "high",
      explanation: "The opening cover letter language could fit too many jobs instead of this one.",
    });
  }
  if (!topEvidenceVisibleEarly) {
    risks.push({
      type: "proof_not_visible_early",
      severity: "medium",
      explanation: "The strongest proof is not obvious early in the resume, so the scan may miss it.",
    });
  }
  if (themeCount > 4) {
    risks.push({
      type: "theme_overload",
      severity: "medium",
      explanation: "Too many themes are competing in the early read, which can dilute the role match.",
    });
  }

  return risks;
}

function determineReadiness(
  input: RoleMatchFinalPassInput,
  priorityCoverage: RoleMatchFinalPassPriorityCoverage[],
  keywordAlignment: RoleMatchFinalPassKeywordAlignment,
  recruiterScanRisks: RoleMatchFinalPassRisk[],
): RoleMatchFinalPass["overallMatchReadiness"] {
  const highRiskCount = recruiterScanRisks.filter((risk) => risk.severity === "high").length;
  const strongPriorityCount = priorityCoverage.filter((entry) => entry.strength === "strong").length;
  const missingPriorityCount = priorityCoverage.filter((entry) => entry.strength === "missing").length;

  if (highRiskCount >= 2 || missingPriorityCount >= 3) {
    return "misaligned";
  }

  const hasReadySignals =
    strongPriorityCount >= Math.min(3, priorityCoverage.length) &&
    keywordAlignment.missingButImportant.length <= 1 &&
    keywordAlignment.stuffedOrExcessive.length === 0 &&
    input.plan.documentQualityScore >= 75;

  if (hasReadySignals && highRiskCount === 0) {
    return "ready";
  }

  return "needs_tightening";
}

function resolveFinalAdjustmentPreset(
  input: RoleMatchFinalPassInput,
  adjustment: RoleMatchFinalAdjustment,
): RefinementPreset | null {
  const priorities = input.plan.roleLens.priorities.map(normalizeLower);
  const hasOperations = priorities.some((value) => value.includes("operat") || value.includes("support") || value.includes("process"));
  const hasLeadership = priorities.some((value) => value.includes("lead") || value.includes("strategy"));

  switch (adjustment.type) {
    case "summary_tighten":
      return REFINEMENT_PRESETS.find((preset) => preset.key === "tighten-summary") ?? null;
    case "bullet_reorder":
      return REFINEMENT_PRESETS.find((preset) => preset.key === "strengthen-impact") ?? null;
    case "keyword_tighten":
      if (hasOperations) {
        return REFINEMENT_PRESETS.find((preset) => preset.key === "emphasize-operations") ?? null;
      }
      if (hasLeadership) {
        return REFINEMENT_PRESETS.find((preset) => preset.key === "emphasize-leadership") ?? null;
      }
      return REFINEMENT_PRESETS.find((preset) => preset.key === "more-strategic") ?? null;
    case "cover_letter_role_focus":
      return REFINEMENT_PRESETS.find((preset) => preset.key === "cover-role-fit") ?? null;
  }
}

function buildRecommendedAdjustments(
  input: RoleMatchFinalPassInput,
  recruiterScanRisks: RoleMatchFinalPassRisk[],
  keywordAlignment: RoleMatchFinalPassKeywordAlignment,
): RoleMatchFinalAdjustment[] {
  const adjustments: RoleMatchFinalAdjustment[] = [];
  const hasRisk = (type: RoleMatchFinalPassRiskType) => recruiterScanRisks.some((risk) => risk.type === type);
  const priorities = input.plan.roleLens.priorities.map(normalizeLower);

  if (hasRisk("top_third_too_generic")) {
    adjustments.push({
      label: "Tighten the summary",
      type: "summary_tighten",
      target: "resume",
    });
  }

  if (hasRisk("proof_not_visible_early") || hasRisk("missing_priority_signal")) {
    adjustments.push({
      label: "Reorder bullets to surface the strongest proof",
      type: "bullet_reorder",
      target: "resume",
    });
  }

  if (hasRisk("weak_keyword_presence") && keywordAlignment.missingButImportant.length > 0) {
    adjustments.push({
      label: "Tighten role keywords naturally",
      type: "keyword_tighten",
      target: "both",
    });
  }

  if (hasRisk("cover_letter_not_role_specific")) {
    adjustments.push({
      label: "Focus the cover letter on this role",
      type: "cover_letter_role_focus",
      target: "cover_letter",
    });
  }

  if (!adjustments.length && priorities.length > 0 && input.plan.documentQualityScore < 85) {
    adjustments.push({
      label: "Tighten the summary",
      type: "summary_tighten",
      target: "resume",
    });
  }

  return adjustments.slice(0, 3);
}

export function buildRoleMatchFinalPass(input: RoleMatchFinalPassInput): RoleMatchFinalPass {
  const buckets = buildBuckets(input);
  const priorityCoverage = evaluatePriorityCoverage(input, buckets);
  const keywordAlignment = evaluateKeywordAlignment(input, buckets);
  const recruiterScanRisks = detectRecruiterScanRisks(input, buckets, priorityCoverage, keywordAlignment);
  const overallMatchReadiness = determineReadiness(input, priorityCoverage, keywordAlignment, recruiterScanRisks);
  const recommendedFinalAdjustments = buildRecommendedAdjustments(
    input,
    recruiterScanRisks,
    keywordAlignment,
  );

  return {
    overallMatchReadiness,
    priorityCoverage,
    keywordAlignment,
    recruiterScanRisks,
    recommendedFinalAdjustments,
  };
}

export function resolveRoleMatchFinalAdjustmentPreset(
  input: RoleMatchFinalPassInput,
  adjustment: RoleMatchFinalAdjustment,
): RefinementPreset | null {
  return resolveFinalAdjustmentPreset(input, adjustment);
}
