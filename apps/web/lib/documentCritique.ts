import type { ResumeModel } from "@shared/resumeModel";

import {
  REFINEMENT_PRESETS,
  type DocumentStrategyPlan,
  type RefinementPreset,
} from "@shared/documentStrategyPlan";

export type DocumentCritiqueIssueType =
  | "summary_generic"
  | "framing_too_broad"
  | "bullet_emphasis_diffuse"
  | "impact_language_weak"
  | "cover_letter_redundant"
  | "cover_letter_fit_weak"
  | "evidence_concentration_low"
  | "repetition_detected";

export type DocumentCritiqueSeverity = "high" | "medium" | "low";

export type DocumentCritiqueOverallAssessment = "strong" | "mixed" | "weak";

export type DocumentCritiqueIssue = {
  type: DocumentCritiqueIssueType;
  severity: DocumentCritiqueSeverity;
  explanation: string;
  recommendedRefinementTypes: string[];
};

export type DocumentCritique = {
  overallAssessment: DocumentCritiqueOverallAssessment;
  topIssues: DocumentCritiqueIssue[];
  recommendedNextAction: {
    label: string;
    refinementType: string;
    target: "resume" | "cover_letter" | "both";
  } | null;
};

type CritiqueInput = {
  plan: DocumentStrategyPlan;
  resumeModel: ResumeModel | null;
  coverLetterParagraphs: string[];
};

const GENERIC_FILLER_PHRASES = [
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
];

const WEAK_ABSTRACTION_PHRASES = [
  "led with impact",
  "delivered results",
  "driven by outcomes",
  "made a difference",
  "worked across teams",
  "strong communicator",
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

const ISSUE_PRIORITY: Record<DocumentCritiqueIssueType, number> = {
  summary_generic: 0,
  framing_too_broad: 1,
  bullet_emphasis_diffuse: 2,
  impact_language_weak: 3,
  cover_letter_redundant: 4,
  cover_letter_fit_weak: 5,
  evidence_concentration_low: 6,
  repetition_detected: 7,
};

const ISSUE_LABELS: Record<DocumentCritiqueIssueType, string> = {
  summary_generic: "Tighten the summary",
  framing_too_broad: "Narrow the framing",
  bullet_emphasis_diffuse: "Re-center bullet emphasis",
  impact_language_weak: "Strengthen impact language",
  cover_letter_redundant: "Reduce cover letter repetition",
  cover_letter_fit_weak: "Strengthen cover letter fit",
  evidence_concentration_low: "Concentrate the strongest evidence",
  repetition_detected: "Reduce repetition",
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

function uniqueTokens(value: string): string[] {
  return Array.from(new Set(tokenize(value)));
}

function joinArtifactText(parts: string[]): string {
  return parts.map(normalizeText).filter(Boolean).join(" ").trim();
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

function coverParagraphs(paragraphs: string[]): string[] {
  return paragraphs.map(normalizeText).filter(Boolean);
}

function bodyCoverParagraphs(paragraphs: string[]): string[] {
  return coverParagraphs(paragraphs).filter(
    (paragraph) =>
      !/^dear\b/i.test(paragraph) &&
      !/^(sincerely|regards|best|thanks|thank you)\b/i.test(paragraph),
  );
}

function artifactCorpus(input: CritiqueInput): string {
  return joinArtifactText([
    resumeSummary(input.resumeModel),
    ...resumeBullets(input.resumeModel),
    ...bodyCoverParagraphs(input.coverLetterParagraphs),
  ]);
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

function hasFrameLead(text: string, frame: string): boolean {
  const frameTokens = uniqueTokens(frame).filter((token) => token.length > 3);
  if (!frameTokens.length) return false;
  const normalized = normalizeLower(text);
  return frameTokens.every((token) => normalized.includes(token));
}

function hasGenericLanguage(text: string): boolean {
  const normalized = normalizeLower(text);
  return (
    GENERIC_FILLER_PHRASES.some((phrase) => normalized.includes(phrase)) ||
    WEAK_ABSTRACTION_PHRASES.some((phrase) => normalized.includes(phrase))
  );
}

function estimateSpecificity(text: string): number {
  const normalized = normalizeLower(text);
  const numericSignals = normalized.match(/\b\d+(?:\.\d+)?(?:%|x|k|m|million|billion)?\b/g)?.length ?? 0;
  const actionSignals = ACTION_VERBS.reduce(
    (count, verb) => count + (normalized.includes(verb) ? 1 : 0),
    0,
  );
  const themeSignals = normalized.split(/\s+/).filter((token) => token.length > 8).length > 3 ? 1 : 0;
  return numericSignals * 3 + actionSignals + themeSignals;
}

function detectRepeatedOpenings(lines: string[]): number {
  const openings = lines
    .map((line) =>
      normalizeLower(line)
        .split(/\s+/)
        .slice(0, 4)
        .join(" "),
    )
    .filter(Boolean);
  const counts = new Map<string, number>();
  for (const opening of openings) {
    counts.set(opening, (counts.get(opening) ?? 0) + 1);
  }
  return Array.from(counts.values()).filter((count) => count > 1).length;
}

function collectThemeMentions(text: string, themes: string[]): number {
  const normalized = normalizeLower(text);
  return themes.filter((theme) => {
    const themeTokens = uniqueTokens(theme).filter((token) => token.length > 3);
    if (!themeTokens.length) return false;
    return themeTokens.some((token) => normalized.includes(token));
  }).length;
}

function topEvidenceMentions(input: CritiqueInput): number {
  const corpus = artifactCorpus(input);
  const topEvidence = input.plan.selectedEvidence.slice(0, 2);
  if (!topEvidence.length) return 0;
  return topEvidence.reduce((count, evidence) => {
    const signalHit =
      evidence.matchedSignals.some((signal) => corpus.includes(normalizeLower(signal))) ||
      collectThemeMentions(corpus, [evidence.baselineSection, evidence.whySelected]) > 0 ||
      evidence.approvedClaims.some((claim) => corpus.includes(normalizeLower(claim)));
    return signalHit ? count + 1 : count;
  }, 0);
}

function choosePriorityRefinementKey(input: CritiqueInput, type: DocumentCritiqueIssueType): string {
  const priorities = input.plan.roleLens.priorities.map(normalizeLower);
  const hasLeadership = priorities.some((value) => value.includes("lead")) || normalizeLower(input.plan.positioningFrame).includes("lead");
  const hasOperations =
    priorities.some((value) => value.includes("operat") || value.includes("support") || value.includes("process")) ||
    normalizeLower(input.plan.positioningFrame).includes("operat");

  switch (type) {
    case "summary_generic":
      return "tighten-summary";
    case "framing_too_broad":
      if (hasLeadership) return "emphasize-leadership";
      if (hasOperations) return "emphasize-operations";
      return "more-strategic";
    case "bullet_emphasis_diffuse":
      if (hasOperations) return "emphasize-operations";
      if (hasLeadership) return "emphasize-leadership";
      return "more-strategic";
    case "impact_language_weak":
      return "strengthen-impact";
    case "cover_letter_redundant":
      return "cover-business-impact";
    case "cover_letter_fit_weak":
      return "cover-role-fit";
    case "evidence_concentration_low":
      return "evidence-swap";
    case "repetition_detected":
      return "reduce-repetition";
  }
}

function resolvePresetByKey(key: string): RefinementPreset | null {
  return REFINEMENT_PRESETS.find((preset) => preset.key === key) ?? null;
}

function buildIssue(
  input: CritiqueInput,
  type: DocumentCritiqueIssueType,
  severity: DocumentCritiqueSeverity,
  explanation: string,
  extraPresetKeys: string[] = [],
): DocumentCritiqueIssue {
  const recommendedRefinementTypes = Array.from(
    new Set([choosePriorityRefinementKey(input, type), ...extraPresetKeys]),
  ).filter((key) => Boolean(resolvePresetByKey(key)));

  return {
    type,
    severity,
    explanation,
    recommendedRefinementTypes,
  };
}

function scoreSeverity(base: number): DocumentCritiqueSeverity {
  if (base >= 5) return "high";
  if (base >= 3) return "medium";
  return "low";
}

function detectSummaryGeneric(input: CritiqueInput): DocumentCritiqueIssue | null {
  const summary = resumeSummary(input.resumeModel);
  if (!summary) return null;

  const genericHits = GENERIC_FILLER_PHRASES.filter((phrase) => normalizeLower(summary).includes(phrase)).length;
  const weakHits = WEAK_ABSTRACTION_PHRASES.filter((phrase) => normalizeLower(summary).includes(phrase)).length;
  const specificity = estimateSpecificity(summary);
  const frameMatched = hasFrameLead(summary, input.plan.positioningFrame);
  const baseScore = genericHits * 2 + weakHits + (frameMatched ? 0 : 2) + (specificity <= 2 ? 2 : 0);
  if (baseScore < 2) return null;

  const severity = scoreSeverity(baseScore);
  return buildIssue(
    input,
    "summary_generic",
    severity,
    "The summary still reads broad and generic instead of leading with the chosen positioning frame.",
  );
}

function detectFramingTooBroad(input: CritiqueInput): DocumentCritiqueIssue | null {
  const corpus = artifactCorpus(input);
  const frameMatched = hasFrameLead(corpus, input.plan.positioningFrame);
  const themeHits = collectThemeMentions(
    corpus,
    [
      ...input.plan.qualityPass.topNarrativeAxes,
      ...input.plan.roleLens.priorities,
      ...input.plan.resumeEmphasis,
    ],
  );
  const spread = new Set(
    [
      ...input.plan.qualityPass.topNarrativeAxes,
      ...input.plan.roleLens.priorities,
      ...input.plan.resumeEmphasis,
    ].filter((theme) => collectThemeMentions(corpus, [theme]) > 0),
  ).size;
  const suppressedLeakHits = countMatches(corpus, input.plan.qualityPass.cutCandidates);
  const baseScore =
    (!frameMatched ? 3 : 0) +
    (!frameMatched && spread >= 5 && themeHits <= 3 ? 1 : 0) +
    (suppressedLeakHits > 0 ? 1 : 0);
  if (baseScore < 3) return null;

  const severity = scoreSeverity(baseScore);
  return buildIssue(
    input,
    "framing_too_broad",
    severity,
    "Too many themes are competing, so the role-specific frame is not yet dominant enough.",
    ["more-strategic"],
  );
}

function detectBulletEmphasisDiffuse(input: CritiqueInput): DocumentCritiqueIssue | null {
  const bullets = resumeBullets(input.resumeModel);
  if (!bullets.length) return null;

  const topThemes = [
    ...input.plan.qualityPass.topNarrativeAxes.slice(0, 3),
    ...input.plan.resumeEmphasis.slice(0, 3),
  ];
  const topThemeHits = bullets.filter((bullet) => collectThemeMentions(bullet, topThemes) > 0).length;
  const distinctThemeHits = new Set(
    bullets.flatMap((bullet) =>
      topThemes.filter((theme) => collectThemeMentions(bullet, [theme]) > 0),
    ),
  ).size;
  const baseScore =
    (bullets.length >= 4 ? 1 : 0) +
    (topThemeHits <= 2 ? 2 : 0) +
    (distinctThemeHits >= 4 ? 2 : 0) +
    (topThemeHits === 0 ? 2 : 0);
  if (baseScore < 2) return null;

  const severity = scoreSeverity(baseScore);
  return buildIssue(
    input,
    "bullet_emphasis_diffuse",
    severity,
    "The bullets cover too many directions at once, which weakens the role-specific story.",
  );
}

function detectImpactLanguageWeak(input: CritiqueInput): DocumentCritiqueIssue | null {
  const summary = resumeSummary(input.resumeModel);
  const bullets = resumeBullets(input.resumeModel);
  const corpus = joinArtifactText([summary, ...bullets]);
  if (!corpus) return null;

  const numericSignals = corpus.match(/\b\d+(?:\.\d+)?(?:%|x|k|m|million|billion)?\b/g)?.length ?? 0;
  const actionSignals = ACTION_VERBS.reduce(
    (count, verb) => count + (normalizeLower(corpus).includes(verb) ? 1 : 0),
    0,
  );
  const approvedClaimsWithMetrics = input.plan.selectedEvidence.some((evidence) =>
    evidence.approvedClaims.some((claim) => /\b\d+(?:\.\d+)?(?:%|x|k|m|million|billion)?\b/i.test(claim)),
  );
  const baseScore =
    (numericSignals === 0 ? 2 : 0) +
    (actionSignals <= 2 ? 2 : 0) +
    (approvedClaimsWithMetrics ? 0 : 1);
  if (baseScore < 2) return null;

  const severity = scoreSeverity(baseScore);
  return buildIssue(
    input,
    "impact_language_weak",
    severity,
    "The language is not carrying enough outcome and impact weight for the evidence available.",
  );
}

function detectCoverLetterRedundant(input: CritiqueInput): DocumentCritiqueIssue | null {
  const cover = bodyCoverParagraphs(input.coverLetterParagraphs);
  if (!cover.length) return null;

  const resumeText = joinArtifactText([resumeSummary(input.resumeModel), ...resumeBullets(input.resumeModel)]);
  const coverText = joinArtifactText(cover);
  const overlap = uniqueTokens(coverText).filter((token) => resumeText.includes(token)).length;
  const repetitivePhrases = [
    "as noted on my resume",
    "as my resume shows",
    "my background includes",
    "i have experience in",
    "i am excited to apply",
    "results-driven",
    "proven track record",
    "delivering results",
    "leading teams",
  ].filter((phrase) => normalizeLower(coverText).includes(phrase)).length;
  const repeatedSentenceStarts = detectRepeatedOpenings(cover);
  const baseScore =
    (repetitivePhrases >= 2 ? 3 : repetitivePhrases === 1 ? 2 : 0) +
    (repeatedSentenceStarts > 0 ? 1 : 0) +
    (overlap >= 16 ? 1 : 0);
  if (baseScore < 2) return null;

  const severity = scoreSeverity(baseScore);
  return buildIssue(
    input,
    "cover_letter_redundant",
    severity,
    "The cover letter is echoing the resume too closely instead of extending the story.",
    ["cover-business-impact"],
  );
}

function detectCoverLetterFitWeak(input: CritiqueInput): DocumentCritiqueIssue | null {
  const cover = bodyCoverParagraphs(input.coverLetterParagraphs);
  if (!cover.length) return null;

  const opening = cover[0] ?? "";
  const frameMatched = hasFrameLead(opening, input.plan.positioningFrame);
  const roleThemeHits = collectThemeMentions(
    opening,
    [...input.plan.qualityPass.topNarrativeAxes, ...input.plan.roleLens.priorities].slice(0, 4),
  );
  const explicitFitSignals = countMatches(opening, [
    input.plan.positioningFrame,
    ...input.plan.roleLens.priorities.slice(0, 2),
  ]);
  const baseScore =
    (!frameMatched && roleThemeHits < 2 ? 2 : 0) +
    (explicitFitSignals === 0 && roleThemeHits === 0 ? 1 : 0);
  if (baseScore < 2) return null;

  const severity = scoreSeverity(baseScore);
  return buildIssue(
    input,
    "cover_letter_fit_weak",
    severity,
    "The cover letter opening is not making the role-specific fit clear enough.",
  );
}

function detectEvidenceConcentrationLow(input: CritiqueInput): DocumentCritiqueIssue | null {
  if (input.plan.selectedEvidence.length < 2) return null;
  const concentrationHits = topEvidenceMentions(input);
  const topEvidenceCount = Math.min(2, input.plan.selectedEvidence.length);
  const baseScore = concentrationHits < topEvidenceCount ? 2 : 0;
  if (baseScore < 2) return null;

  return buildIssue(
    input,
    "evidence_concentration_low",
    "medium",
    "The strongest evidence is not concentrated early enough, so the argument feels more diffuse than it should.",
    ["evidence-swap"],
  );
}

function detectRepetitionDetected(input: CritiqueInput): DocumentCritiqueIssue | null {
  const bullets = resumeBullets(input.resumeModel);
  const cover = bodyCoverParagraphs(input.coverLetterParagraphs);
  const summary = resumeSummary(input.resumeModel);
  const repeatedOpenings = detectRepeatedOpenings([...bullets, ...cover, summary]);
  const repeatedCutCandidates = countMatches(joinArtifactText([summary, ...bullets, ...cover]), input.plan.qualityPass.avoidRepeating);
  const baseScore = (repeatedOpenings > 0 ? 2 : 0) + (repeatedCutCandidates > 1 ? 1 : 0);
  if (baseScore < 2) return null;

  const severity = scoreSeverity(baseScore);
  return buildIssue(
    input,
    "repetition_detected",
    severity,
    "Several lines are repeating the same opening move or theme, which makes the documents feel less selective.",
  );
}

function issueSortScore(issue: DocumentCritiqueIssue): number {
  const severityScore = issue.severity === "high" ? 3 : issue.severity === "medium" ? 2 : 1;
  return severityScore * 10 + (100 - ISSUE_PRIORITY[issue.type]);
}

export function resolveCritiqueIssuePreset(issue: DocumentCritiqueIssue): RefinementPreset | null {
  for (const key of issue.recommendedRefinementTypes) {
    const preset = REFINEMENT_PRESETS.find((entry) => entry.key === key);
    if (preset) return preset;
  }
  return null;
}

export function resolveCritiqueBestNextPreset(critique: DocumentCritique): RefinementPreset | null {
  if (!critique.recommendedNextAction) return null;
  const next = critique.topIssues[0];
  if (!next) return null;
  return resolveCritiqueIssuePreset(next);
}

export function buildDocumentCritique(input: CritiqueInput): DocumentCritique | null {
  const issues = [
    detectSummaryGeneric(input),
    detectFramingTooBroad(input),
    detectBulletEmphasisDiffuse(input),
    detectImpactLanguageWeak(input),
    detectCoverLetterRedundant(input),
    detectCoverLetterFitWeak(input),
    detectEvidenceConcentrationLow(input),
    detectRepetitionDetected(input),
  ]
    .filter((issue): issue is DocumentCritiqueIssue => Boolean(issue))
    .sort((a, b) => issueSortScore(b) - issueSortScore(a));

  const topIssues = issues.slice(0, 3);
  if (!topIssues.length) {
    return {
      overallAssessment:
        input.plan.documentQualityScore >= 80 ? "strong" : input.plan.documentQualityScore >= 65 ? "mixed" : "weak",
      topIssues: [],
      recommendedNextAction: null,
    };
  }

  const issueSeverities = topIssues.map((issue) => issue.severity);
  const hasHigh = issueSeverities.includes("high");
  const overallAssessment: DocumentCritiqueOverallAssessment =
    !hasHigh && input.plan.documentQualityScore >= 80
      ? "strong"
      : hasHigh || input.plan.documentQualityScore < 65
      ? "weak"
      : "mixed";

  const recommendedPreset = resolveCritiqueIssuePreset(topIssues[0]);
  const recommendedNextAction = overallAssessment === "strong"
    ? null
    : recommendedPreset
    ? {
        label: recommendedPreset.label,
        refinementType: recommendedPreset.type,
        target: recommendedPreset.target,
      }
    : null;

  return {
    overallAssessment,
    topIssues,
    recommendedNextAction,
  };
}

export function getCritiqueIssueLabel(type: DocumentCritiqueIssueType): string {
  return ISSUE_LABELS[type];
}

