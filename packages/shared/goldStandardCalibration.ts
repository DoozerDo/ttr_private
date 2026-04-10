import { buildLanguageStylePass } from "./languageStylePass";
import type { DocumentStrategyPlan } from "./documentStrategyPlan";

export type GoldStandardBenchmarkResume = {
  summary: string;
  bullets: string[];
};

export type GoldStandardBenchmarkCoverLetter = {
  opening: string;
  bodyParagraphs: string[];
  closingParagraph: string;
};

export type GoldStandardBenchmarkFixture = {
  fixtureId: string;
  baselineId: string;
  jobId: string;
  scenarioName: string;
  benchmarkPositioningFrame: string;
  approvedBenchmarkResume: GoldStandardBenchmarkResume;
  approvedBenchmarkCoverLetter: GoldStandardBenchmarkCoverLetter;
  notes?: string;
};

export type GoldStandardCalibrationDimensionScores = {
  framingAlignment: number;
  evidenceSelectionQuality: number;
  suppressionDiscipline: number;
  resumeClarity: number;
  coverLetterSpecificity: number;
  rolePriorityVisibility: number;
  languageSharpness: number;
  crossArtifactConsistency: number;
};

export type GoldStandardCalibrationGapType =
  | "framing_weaker_than_benchmark"
  | "evidence_too_diffuse"
  | "important_proof_not_visible_early"
  | "cover_letter_too_generic"
  | "language_less_sharp"
  | "suppression_too_weak"
  | "role_signal_underweighted";

export type GoldStandardCalibrationGap = {
  type: GoldStandardCalibrationGapType;
  severity: "high" | "medium" | "low";
  explanation: string;
};

export type GoldStandardCalibration = {
  overallCalibration: "aligned" | "close" | "off_target";
  dimensionScores: GoldStandardCalibrationDimensionScores;
  topGaps: GoldStandardCalibrationGap[];
  benchmarkSummary: {
    strongestBenchmarkTraits: string[];
    missingInGeneratedOutput: string[];
  };
  recommendedSystemAdjustments: string[];
};

export type GoldStandardCalibrationInput = {
  plan: DocumentStrategyPlan;
  generatedResume: GoldStandardBenchmarkResume;
  generatedCoverLetter: GoldStandardBenchmarkCoverLetter;
  benchmark: GoldStandardBenchmarkFixture;
};

export type GoldStandardCalibrationReport = {
  calibration: GoldStandardCalibration;
  likelySubsystemCauses: string[];
  summary: string;
};

export type GoldStandardCalibrationMinimumBar = {
  minimumOverallCalibration: "aligned" | "close";
  minimumDimensionScores: Partial<Record<keyof GoldStandardCalibrationDimensionScores, number>>;
  maximumHighSeverityGaps: number;
};

type ArtifactSignalBundle = {
  summary: string;
  bullets: string[];
  opening: string;
  bodyParagraphs: string[];
  closingParagraph: string;
  allText: string;
  topThirdText: string;
  stylePass: ReturnType<typeof buildLanguageStylePass>;
};

const ROLE_SIGNAL_SUPPORT = [
  "support operations",
  "service delivery",
  "incident",
  "triage",
  "escalation",
  "workflow",
  "process",
  "cross-functional",
  "customer experience",
  "saaS",
];

const ROLE_SIGNAL_INCIDENT = [
  "incident response",
  "service delivery",
  "escalation",
  "reliability",
  "triage",
  "workflow",
  "cross-functional",
  "support operations",
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
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
}

function countPhraseHits(text: string, phrases: string[]): number {
  const lowered = normalizeLower(text);
  return phrases.reduce((count, phrase) => (lowered.includes(normalizeLower(phrase)) ? count + 1 : count), 0);
}

function countPhraseOccurrences(text: string, phrase: string): number {
  const lowered = normalizeLower(text);
  const target = normalizeLower(phrase);
  if (!target) return 0;
  return lowered.split(target).length - 1;
}

function splitSentences(text: string): string[] {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeText(sentence))
    .filter(Boolean);
}

function averageSentenceLength(text: string): number {
  const sentences = splitSentences(text);
  if (!sentences.length) return 0;
  const totalWords = sentences.reduce((count, sentence) => count + tokenize(sentence).length, 0);
  return totalWords / sentences.length;
}

function sentenceOpeners(text: string): string[] {
  return splitSentences(text).map((sentence) => tokenize(sentence).slice(0, 3).join(" ")).filter(Boolean);
}

function repeatedOpeners(text: string): number {
  const openers = sentenceOpeners(text);
  const counts = new Map<string, number>();
  for (const opener of openers) {
    counts.set(opener, (counts.get(opener) ?? 0) + 1);
  }
  return Array.from(counts.values()).filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
}

function joinText(values: string[]): string {
  return values.map(normalizeText).filter(Boolean).join(" ").trim();
}

function artifactSignalBundle(
  plan: DocumentStrategyPlan,
  artifact: GoldStandardBenchmarkResume | GoldStandardBenchmarkCoverLetter,
  benchmarkPositioningFrame: string,
): ArtifactSignalBundle {
  const summary = "summary" in artifact ? normalizeText(artifact.summary) : "";
  const bullets = "bullets" in artifact ? artifact.bullets.map(normalizeText).filter(Boolean) : [];
  const opening = "opening" in artifact ? normalizeText(artifact.opening) : "";
  const bodyParagraphs = "bodyParagraphs" in artifact ? artifact.bodyParagraphs.map(normalizeText).filter(Boolean) : [];
  const closingParagraph = "closingParagraph" in artifact ? normalizeText(artifact.closingParagraph) : "";
  const allText = joinText([summary, ...bullets, opening, ...bodyParagraphs, closingParagraph]);
  const topThirdText = joinText([summary, ...bullets.slice(0, 2), opening]);
  const stylePass = buildLanguageStylePass({
    plan,
    roleLabel: benchmarkPositioningFrame,
    resumeSummary: summary,
    resumeBullets: bullets,
    coverOpening: opening,
    coverParagraphs: [opening, ...bodyParagraphs, closingParagraph].filter(Boolean),
  });

  return {
    summary,
    bullets,
    opening,
    bodyParagraphs,
    closingParagraph,
    allText,
    topThirdText,
    stylePass,
  };
}

function buildRoleSignals(plan: DocumentStrategyPlan): string[] {
  return uniqueValues([
    plan.positioningFrame,
    ...(plan.roleLens.priorities ?? []),
    ...(plan.roleLens.requiredSignals ?? []),
    ...(plan.roleLens.targetKeywords ?? []),
  ]).flatMap((value) => tokenize(value).filter((token) => token.length > 3));
}

function compareSignalCoverage(text: string, signals: string[]): number {
  if (!signals.length) return 0.5;
  const lowered = normalizeLower(text);
  const hits = signals.reduce((count, signal) => (lowered.includes(signal) ? count + 1 : count), 0);
  return hits / signals.length;
}

function ratioScore(generated: number, benchmark: number): number {
  const denominator = Math.max(benchmark, 0.35);
  return Math.max(0, Math.min(100, Math.round((generated / denominator) * 100)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function computeFrameMetric(
  plan: DocumentStrategyPlan,
  signals: string[],
  artifact: ArtifactSignalBundle,
  benchmarkFrame: string,
): number {
  const framePresence =
    countPhraseHits(artifact.summary, [plan.positioningFrame, benchmarkFrame]) > 0 ||
    countPhraseHits(artifact.opening, [plan.positioningFrame, benchmarkFrame]) > 0
      ? 1
      : 0;
  const signalCoverage = compareSignalCoverage(artifact.topThirdText, signals);
  return clamp01(framePresence * 0.55 + signalCoverage * 0.45);
}

function computeEvidenceMetric(
  plan: DocumentStrategyPlan,
  artifact: ArtifactSignalBundle,
  benchmarkArtifact: ArtifactSignalBundle,
): number {
  const selectedEvidence = plan.selectedEvidence.slice(0, 4);
  if (!selectedEvidence.length) return 0.5;

  const generatedHits = selectedEvidence.reduce((count, evidence) => {
    const evidenceText = joinText([evidence.baselineSection, evidence.whySelected, ...evidence.matchedSignals, ...evidence.approvedClaims]);
    return count + (normalizeLower(artifact.topThirdText).includes(normalizeLower(evidenceText)) ? 1 : 0);
  }, 0);
  const benchmarkHits = selectedEvidence.reduce((count, evidence) => {
    const evidenceText = joinText([evidence.baselineSection, evidence.whySelected, ...evidence.matchedSignals, ...evidence.approvedClaims]);
    return count + (normalizeLower(benchmarkArtifact.topThirdText).includes(normalizeLower(evidenceText)) ? 1 : 0);
  }, 0);

  const concentration = 1 - Math.min(1, Math.max(0, artifact.topThirdText.split(/\s+/).length - 80) / 80);
  const benchmarkConcentration = 1 - Math.min(1, Math.max(0, benchmarkArtifact.topThirdText.split(/\s+/).length - 80) / 80);
  const visibleEvidence = selectedEvidence.length ? generatedHits / selectedEvidence.length : 0;
  const benchmarkVisible = selectedEvidence.length ? benchmarkHits / selectedEvidence.length : 0;

  return clamp01((visibleEvidence * 0.55 + concentration * 0.45) / Math.max(benchmarkVisible * 0.55 + benchmarkConcentration * 0.45, 0.35));
}

function computeSuppressionMetric(artifact: ArtifactSignalBundle, benchmarkArtifact: ArtifactSignalBundle): number {
  const genericPenalty =
    artifact.stylePass.issues.filter((issue) => issue.type === "generic_phrase").length * 0.12 +
    artifact.stylePass.issues.filter((issue) => issue.type === "repetition_pattern").length * 0.08 +
    artifact.stylePass.issues.filter((issue) => issue.type === "overly_verbose").length * 0.06 +
    repeatedOpeners(artifact.allText) * 0.08;
  const benchmarkPenalty =
    benchmarkArtifact.stylePass.issues.filter((issue) => issue.type === "generic_phrase").length * 0.12 +
    benchmarkArtifact.stylePass.issues.filter((issue) => issue.type === "repetition_pattern").length * 0.08 +
    benchmarkArtifact.stylePass.issues.filter((issue) => issue.type === "overly_verbose").length * 0.06 +
    repeatedOpeners(benchmarkArtifact.allText) * 0.08;
  const score = 1 - Math.max(0, genericPenalty - benchmarkPenalty);
  return clamp01(score);
}

function computeResumeClarityMetric(artifact: ArtifactSignalBundle, benchmarkArtifact: ArtifactSignalBundle): number {
  const generatedSummaryLength = tokenize(artifact.summary).length;
  const benchmarkSummaryLength = tokenize(benchmarkArtifact.summary).length || 1;
  const generatedSentenceLength = averageSentenceLength(joinText([artifact.summary, ...artifact.bullets.slice(0, 2)]));
  const benchmarkSentenceLength = averageSentenceLength(joinText([benchmarkArtifact.summary, ...benchmarkArtifact.bullets.slice(0, 2)])) || 1;
  const summaryProximity = 1 - Math.min(1, Math.abs(generatedSummaryLength - benchmarkSummaryLength) / Math.max(benchmarkSummaryLength, 10));
  const sentenceProximity = 1 - Math.min(1, Math.abs(generatedSentenceLength - benchmarkSentenceLength) / Math.max(benchmarkSentenceLength, 10));
  return clamp01(summaryProximity * 0.45 + sentenceProximity * 0.55);
}

function computeCoverSpecificityMetric(
  plan: DocumentStrategyPlan,
  artifact: ArtifactSignalBundle,
  benchmarkArtifact: ArtifactSignalBundle,
): number {
  const signals = [
    ...plan.roleLens.priorities,
    ...plan.roleLens.requiredSignals,
    ...plan.roleLens.targetKeywords,
  ];
  const generatedVisibility = compareSignalCoverage(joinText([artifact.opening, ...artifact.bodyParagraphs.slice(0, 1)]), signals);
  const benchmarkVisibility = compareSignalCoverage(joinText([benchmarkArtifact.opening, ...benchmarkArtifact.bodyParagraphs.slice(0, 1)]), signals);
  const genericPenalty = artifact.stylePass.issues.filter((issue) => issue.location.startsWith("cover_letter") && issue.type === "weak_opening").length;
  const benchmarkPenalty = benchmarkArtifact.stylePass.issues.filter((issue) => issue.location.startsWith("cover_letter") && issue.type === "weak_opening").length;
  return clamp01((generatedVisibility * 0.8 + (1 - genericPenalty * 0.2) * 0.2) / Math.max(benchmarkVisibility * 0.8 + (1 - benchmarkPenalty * 0.2) * 0.2, 0.35));
}

function computePriorityVisibilityMetric(
  plan: DocumentStrategyPlan,
  artifact: ArtifactSignalBundle,
  benchmarkArtifact: ArtifactSignalBundle,
): number {
  const priorities = plan.roleLens.priorities.slice(0, 3);
  if (!priorities.length) return 0.5;
  const generated = priorities.reduce((count, priority) => {
    const lowered = normalizeLower(joinText([artifact.summary, ...artifact.bullets.slice(0, 2), artifact.opening]));
    return count + (lowered.includes(normalizeLower(priority)) ? 1 : 0);
  }, 0);
  const benchmark = priorities.reduce((count, priority) => {
    const lowered = normalizeLower(joinText([benchmarkArtifact.summary, ...benchmarkArtifact.bullets.slice(0, 2), benchmarkArtifact.opening]));
    return count + (lowered.includes(normalizeLower(priority)) ? 1 : 0);
  }, 0);
  return clamp01((generated / priorities.length) / Math.max(benchmark / priorities.length, 0.35));
}

function computeLanguageSharpnessMetric(artifact: ArtifactSignalBundle, benchmarkArtifact: ArtifactSignalBundle): number {
  const generatedPenalty =
    artifact.stylePass.issues.filter((issue) => issue.type === "generic_phrase").length * 0.15 +
    artifact.stylePass.issues.filter((issue) => issue.type === "redundant_modifier").length * 0.08 +
    artifact.stylePass.issues.filter((issue) => issue.type === "ai_cadence").length * 0.12;
  const benchmarkPenalty =
    benchmarkArtifact.stylePass.issues.filter((issue) => issue.type === "generic_phrase").length * 0.15 +
    benchmarkArtifact.stylePass.issues.filter((issue) => issue.type === "redundant_modifier").length * 0.08 +
    benchmarkArtifact.stylePass.issues.filter((issue) => issue.type === "ai_cadence").length * 0.12;
  return clamp01(1 - Math.max(0, generatedPenalty - benchmarkPenalty));
}

function computeCrossArtifactMetric(
  plan: DocumentStrategyPlan,
  generatedResume: ArtifactSignalBundle,
  generatedCover: ArtifactSignalBundle,
  benchmarkResume: ArtifactSignalBundle,
  benchmarkCover: ArtifactSignalBundle,
): number {
  const signals = [
    plan.positioningFrame,
    ...plan.roleLens.priorities.slice(0, 4),
    ...plan.roleLens.requiredSignals.slice(0, 4),
  ];
  const generatedOverlap = compareSignalCoverage(joinText([generatedResume.topThirdText, generatedCover.topThirdText]), signals);
  const benchmarkOverlap = compareSignalCoverage(joinText([benchmarkResume.topThirdText, benchmarkCover.topThirdText]), signals);
  const consistencyPenalty = Math.abs(generatedResume.stylePass.issues.length - generatedCover.stylePass.issues.length) * 0.02;
  return clamp01((generatedOverlap * 0.85 + (1 - consistencyPenalty) * 0.15) / Math.max(benchmarkOverlap, 0.35));
}

function buildStrongestBenchmarkTraits(
  benchmarkResume: ArtifactSignalBundle,
  benchmarkCover: ArtifactSignalBundle,
  plan: DocumentStrategyPlan,
): string[] {
  const traits: string[] = [];
  if (normalizeLower(benchmarkResume.summary).includes(normalizeLower(plan.positioningFrame))) {
    traits.push("Leads with the positioning frame in the summary");
  }
  if (compareSignalCoverage(joinText([benchmarkResume.summary, ...benchmarkResume.bullets.slice(0, 2)]), plan.roleLens.priorities.slice(0, 3)) >= 0.66) {
    traits.push("Makes top role priorities visible early");
  }
  if (benchmarkCover.stylePass.issues.filter((issue) => issue.type === "weak_opening").length === 0) {
    traits.push("Opens the cover letter with role-specific fit");
  }
  if (benchmarkResume.stylePass.issues.filter((issue) => issue.type === "generic_phrase").length === 0 && benchmarkCover.stylePass.issues.filter((issue) => issue.type === "generic_phrase").length === 0) {
    traits.push("Stays sharp and avoids filler");
  }
  if (!traits.length) {
    traits.push("Shows a well-concentrated role narrative");
  }
  return traits.slice(0, 4);
}

function mapGapToSubsystems(gap: GoldStandardCalibrationGapType): string[] {
  switch (gap) {
    case "framing_weaker_than_benchmark":
      return ["DocumentStrategyPlan positioning frame", "DocumentStrategyPlan quality pass"];
    case "evidence_too_diffuse":
      return ["DocumentStrategyPlan selected evidence ranking"];
    case "important_proof_not_visible_early":
      return ["RoleMatchFinalPass", "DocumentStrategyPlan evidence ordering"];
    case "cover_letter_too_generic":
      return ["RoleMatchFinalPass", "LanguageStylePass"];
    case "language_less_sharp":
      return ["LanguageStylePass"];
    case "suppression_too_weak":
      return ["DocumentStrategyPlan suppression notes", "LanguageStylePass"];
    case "role_signal_underweighted":
      return ["DocumentStrategyPlan role lens", "RoleMatchFinalPass"];
  }
}

export function mapGoldStandardCalibrationGapToSubsystems(
  gap: GoldStandardCalibrationGapType,
): string[] {
  return mapGapToSubsystems(gap);
}

function gapToAdjustment(gap: GoldStandardCalibrationGapType): string {
  switch (gap) {
    case "framing_weaker_than_benchmark":
      return "Strengthen positioning frame selection and summary lead.";
    case "evidence_too_diffuse":
      return "Tighten selected evidence ranking and keep the strongest proof early.";
    case "important_proof_not_visible_early":
      return "Surface stronger proof in the top third and reorder bullets.";
    case "cover_letter_too_generic":
      return "Make the cover letter more role-specific and less template-like.";
    case "language_less_sharp":
      return "Tighten phrasing and reduce filler language.";
    case "suppression_too_weak":
      return "Apply suppression notes more aggressively across both artifacts.";
    case "role_signal_underweighted":
      return "Raise the role's top signals higher in the narrative.";
  }
}

function makeGap(
  type: GoldStandardCalibrationGapType,
  severity: "high" | "medium" | "low",
  explanation: string,
): GoldStandardCalibrationGap {
  return { type, severity, explanation };
}

function topGapSeverity(score: number, delta: number): "high" | "medium" | "low" {
  if (score < 65 || delta < -0.25) return "high";
  if (score < 80 || delta < -0.12) return "medium";
  return "low";
}

function buildGapSet(
  plan: DocumentStrategyPlan,
  generatedResume: ArtifactSignalBundle,
  generatedCover: ArtifactSignalBundle,
  benchmarkResume: ArtifactSignalBundle,
  benchmarkCover: ArtifactSignalBundle,
  scores: GoldStandardCalibrationDimensionScores,
): GoldStandardCalibrationGap[] {
  const gaps: GoldStandardCalibrationGap[] = [];
  const frameDelta = scores.framingAlignment - 100;
  const evidenceDelta = scores.evidenceSelectionQuality - 100;
  const visibilityDelta = scores.rolePriorityVisibility - 100;
  const coverDelta = scores.coverLetterSpecificity - 100;
  const languageDelta = scores.languageSharpness - 100;
  const suppressionDelta = scores.suppressionDiscipline - 100;
  const consistencyDelta = scores.crossArtifactConsistency - 100;

  if (scores.framingAlignment < 85 || frameDelta < -15) {
    gaps.push(
      makeGap(
        "framing_weaker_than_benchmark",
        topGapSeverity(scores.framingAlignment, frameDelta / 100),
        "The generated opening is not as cleanly framed around the target role as the benchmark pair.",
      ),
    );
  }
  if (scores.evidenceSelectionQuality < 82 || evidenceDelta < -18) {
    gaps.push(
      makeGap(
        "evidence_too_diffuse",
        topGapSeverity(scores.evidenceSelectionQuality, evidenceDelta / 100),
        "The benchmark keeps its proof more concentrated and easier to scan.",
      ),
    );
  }
  if (scores.rolePriorityVisibility < 80 || visibilityDelta < -20) {
    gaps.push(
      makeGap(
        "important_proof_not_visible_early",
        topGapSeverity(scores.rolePriorityVisibility, visibilityDelta / 100),
        "The benchmark surfaces core priorities earlier in the resume and cover opening.",
      ),
    );
  }
  if (scores.coverLetterSpecificity < 82 || coverDelta < -18) {
    gaps.push(
      makeGap(
        "cover_letter_too_generic",
        topGapSeverity(scores.coverLetterSpecificity, coverDelta / 100),
        "The benchmark cover letter speaks more directly to this job.",
      ),
    );
  }
  if (scores.languageSharpness < 84 || languageDelta < -16) {
    gaps.push(
      makeGap(
        "language_less_sharp",
        topGapSeverity(scores.languageSharpness, languageDelta / 100),
        "The benchmark uses tighter, cleaner language with less filler.",
      ),
    );
  }
  if (scores.suppressionDiscipline < 84 || suppressionDelta < -16) {
    gaps.push(
      makeGap(
        "suppression_too_weak",
        topGapSeverity(scores.suppressionDiscipline, suppressionDelta / 100),
        "The benchmark suppresses weak or generic material more aggressively.",
      ),
    );
  }
  if (scores.crossArtifactConsistency < 82 || consistencyDelta < -18) {
    gaps.push(
      makeGap(
        "role_signal_underweighted",
        topGapSeverity(scores.crossArtifactConsistency, consistencyDelta / 100),
        "The benchmark keeps the same role signal across both artifacts more consistently.",
      ),
    );
  }

  return gaps.slice(0, 4);
}

function computeOverallCalibration(scores: GoldStandardCalibrationDimensionScores, topGaps: GoldStandardCalibrationGap[]): GoldStandardCalibration["overallCalibration"] {
  const average =
    Object.values(scores).reduce((sum, value) => sum + value, 0) /
    Object.keys(scores).length;
  const highGapCount = topGaps.filter((gap) => gap.severity === "high").length;

  if (average >= 86 && highGapCount === 0 && Math.min(...Object.values(scores)) >= 78) {
    return "aligned";
  }
  if (average >= 72 && highGapCount <= 1 && Math.min(...Object.values(scores)) >= 60) {
    return "close";
  }
  return "off_target";
}

export const GOLD_STANDARD_BENCHMARK_FIXTURES: GoldStandardBenchmarkFixture[] = [
  {
    fixtureId: "support-ops-director-v1",
    baselineId: "baseline-ops-1",
    jobId: "job-ops-1",
    scenarioName: "Support operations director",
    benchmarkPositioningFrame: "Customer Operations and Support Strategy leader",
    notes: "Strong benchmark for support workflow rigor, early proof, and additive cover-letter framing.",
    approvedBenchmarkResume: {
      summary:
        "Customer Operations and Support Strategy leader focused on support operations rigor, workflow design, and cross-functional execution. Leads intake, triage, and escalation systems that improve service quality and make the queue easier to run.",
      bullets: [
        "Led support operations for a high-volume service team and built intake, triage, and escalation routines that reduced repeat tickets.",
        "Worked with product and engineering partners to prioritize root-cause fixes and stabilize the most frequent incident paths.",
        "Built weekly operating reviews that connected queue health, service quality, and staffing decisions for leadership.",
        "Documented escalation playbooks and ownership paths so cross-functional response was faster and more predictable.",
      ],
    },
    approvedBenchmarkCoverLetter: {
      opening:
        "I am applying for Support Operations Manager because my background fits a team that needs stronger support workflows, clearer escalation routines, and steady cross-functional follow-through.",
      bodyParagraphs: [
        "In my recent work, I have led support operations, improved service reliability, and partnered with product and engineering to remove recurring customer pain points.",
        "That combination lets me contribute quickly without repeating the resume: I can bring operating discipline, clearer workflow ownership, and practical coordination across teams.",
      ],
      closingParagraph:
        "I would welcome the chance to discuss how that experience can support your team's service quality and operating rhythm.",
    },
  },
  {
    fixtureId: "incident-service-leader-v1",
    baselineId: "baseline-incident-1",
    jobId: "job-incident-1",
    scenarioName: "Incident and service delivery leader",
    benchmarkPositioningFrame: "Service delivery and incident operations leader",
    notes: "Shows stronger incident-specific framing and first-paragraph specificity.",
    approvedBenchmarkResume: {
      summary:
        "Service delivery and incident operations leader focused on incident response, service reliability, and process architecture. Builds operating rhythms that shorten response time and improve how teams handle escalations.",
      bullets: [
        "Led incident response routines and improved escalation triage across support and engineering partners.",
        "Built process architecture that clarified ownership, reduced handoff delays, and improved service recovery.",
        "Created service review cadences that kept recurring issues visible and easier to act on.",
        "Partnered with cross-functional leaders to make support readiness and incident tracking more consistent.",
      ],
    },
    approvedBenchmarkCoverLetter: {
      opening:
        "I am applying for this role because my work has centered on service delivery, incident operations, and the operating discipline needed to keep escalations moving.",
      bodyParagraphs: [
        "My strongest contribution is the combination of incident response leadership and process clarity: I have helped teams reduce handoff friction, tighten follow-through, and keep service recovery visible.",
        "That makes this role a strong match because I can bring direct operational context and a clear sense of how to keep the work moving when things get busy.",
      ],
      closingParagraph:
        "I would be glad to discuss how this background can support your service delivery and incident goals.",
    },
  },
];

export function listGoldStandardBenchmarkFixtures(): GoldStandardBenchmarkFixture[] {
  return GOLD_STANDARD_BENCHMARK_FIXTURES.slice();
}

export function getGoldStandardBenchmarkFixture(
  fixtureId: string,
): GoldStandardBenchmarkFixture | null {
  return GOLD_STANDARD_BENCHMARK_FIXTURES.find((fixture) => fixture.fixtureId === fixtureId) ?? null;
}

export function buildGoldStandardCalibration(
  input: GoldStandardCalibrationInput,
): GoldStandardCalibration {
  const generatedResume = artifactSignalBundle(
    input.plan,
    input.generatedResume,
    input.plan.positioningFrame,
  );
  const generatedCover = artifactSignalBundle(
    input.plan,
    input.generatedCoverLetter,
    input.plan.positioningFrame,
  );
  const benchmarkResume = artifactSignalBundle(
    input.plan,
    input.benchmark.approvedBenchmarkResume,
    input.benchmark.benchmarkPositioningFrame,
  );
  const benchmarkCover = artifactSignalBundle(
    input.plan,
    input.benchmark.approvedBenchmarkCoverLetter,
    input.benchmark.benchmarkPositioningFrame,
  );

  const roleSignals = buildRoleSignals(input.plan);
  const benchmarkRoleSignals = uniqueValues([
    ...tokenize(input.benchmark.benchmarkPositioningFrame),
    ...roleSignals.slice(0, 8),
  ]);

  const generatedFrame = computeFrameMetric(
    input.plan,
    roleSignals,
    generatedResume,
    input.benchmark.benchmarkPositioningFrame,
  );
  const benchmarkFrame = computeFrameMetric(
    input.plan,
    benchmarkRoleSignals,
    benchmarkResume,
    input.benchmark.benchmarkPositioningFrame,
  );
  const framingAlignment = ratioScore(generatedFrame, benchmarkFrame);

  const generatedEvidence = computeEvidenceMetric(input.plan, generatedResume, benchmarkResume);
  const benchmarkEvidence = computeEvidenceMetric(input.plan, benchmarkResume, benchmarkResume);
  const evidenceSelectionQuality = ratioScore(generatedEvidence, benchmarkEvidence);

  const generatedSuppression = computeSuppressionMetric(generatedResume, benchmarkResume);
  const benchmarkSuppression = computeSuppressionMetric(benchmarkResume, benchmarkResume);
  const suppressionDiscipline = ratioScore(generatedSuppression, benchmarkSuppression);

  const generatedClarity = computeResumeClarityMetric(generatedResume, benchmarkResume);
  const benchmarkClarity = computeResumeClarityMetric(benchmarkResume, benchmarkResume);
  const resumeClarity = ratioScore(generatedClarity, benchmarkClarity);

  const generatedSpecificity = computeCoverSpecificityMetric(input.plan, generatedCover, benchmarkCover);
  const benchmarkSpecificity = computeCoverSpecificityMetric(input.plan, benchmarkCover, benchmarkCover);
  const coverLetterSpecificity = ratioScore(generatedSpecificity, benchmarkSpecificity);

  const generatedVisibility = computePriorityVisibilityMetric(input.plan, generatedResume, benchmarkResume);
  const benchmarkVisibility = computePriorityVisibilityMetric(input.plan, benchmarkResume, benchmarkResume);
  const rolePriorityVisibility = ratioScore(generatedVisibility, benchmarkVisibility);

  const generatedSharpness = computeLanguageSharpnessMetric(generatedResume, benchmarkResume);
  const benchmarkSharpness = computeLanguageSharpnessMetric(benchmarkResume, benchmarkResume);
  const languageSharpness = ratioScore(generatedSharpness, benchmarkSharpness);

  const generatedConsistency = computeCrossArtifactMetric(
    input.plan,
    generatedResume,
    generatedCover,
    benchmarkResume,
    benchmarkCover,
  );
  const benchmarkConsistency = computeCrossArtifactMetric(
    input.plan,
    benchmarkResume,
    benchmarkCover,
    benchmarkResume,
    benchmarkCover,
  );
  const crossArtifactConsistency = ratioScore(generatedConsistency, benchmarkConsistency);

  const dimensionScores: GoldStandardCalibrationDimensionScores = {
    framingAlignment,
    evidenceSelectionQuality,
    suppressionDiscipline,
    resumeClarity,
    coverLetterSpecificity,
    rolePriorityVisibility,
    languageSharpness,
    crossArtifactConsistency,
  };

  const topGaps = buildGapSet(
    input.plan,
    generatedResume,
    generatedCover,
    benchmarkResume,
    benchmarkCover,
    dimensionScores,
  );

  const benchmarkSummary = {
    strongestBenchmarkTraits: buildStrongestBenchmarkTraits(
      benchmarkResume,
      benchmarkCover,
      input.plan,
    ),
    missingInGeneratedOutput: topGaps.map((gap) => gap.explanation),
  };

  const recommendedSystemAdjustments = uniqueValues(
    topGaps.flatMap((gap) => [gapToAdjustment(gap.type), ...mapGapToSubsystems(gap.type)]),
  );

  return {
    overallCalibration: computeOverallCalibration(dimensionScores, topGaps),
    dimensionScores,
    topGaps,
    benchmarkSummary,
    recommendedSystemAdjustments,
  };
}

export function buildGoldStandardCalibrationReport(
  calibration: GoldStandardCalibration,
  benchmark: GoldStandardBenchmarkFixture,
): GoldStandardCalibrationReport {
  const likelySubsystemCauses = uniqueValues(
    calibration.topGaps.flatMap((gap) => mapGapToSubsystems(gap.type)),
  );
  const summary =
    calibration.overallCalibration === "aligned"
      ? `Calibration is aligned for ${benchmark.scenarioName}.`
      : calibration.overallCalibration === "close"
        ? `Calibration is close for ${benchmark.scenarioName}, but still has room to tighten.`
        : `Calibration is off target for ${benchmark.scenarioName} and should be improved before treating it as benchmark-grade.`;

  return {
    calibration,
    likelySubsystemCauses,
    summary,
  };
}

export const GOLD_STANDARD_CALIBRATION_MINIMUM_BAR: GoldStandardCalibrationMinimumBar = {
  minimumOverallCalibration: "close",
  minimumDimensionScores: {
    framingAlignment: 72,
    evidenceSelectionQuality: 72,
    suppressionDiscipline: 72,
    resumeClarity: 72,
    coverLetterSpecificity: 72,
    rolePriorityVisibility: 72,
    languageSharpness: 72,
    crossArtifactConsistency: 72,
  },
  maximumHighSeverityGaps: 1,
};

export function meetsGoldStandardCalibrationMinimumBar(
  calibration: GoldStandardCalibration,
  minimumBar: GoldStandardCalibrationMinimumBar = GOLD_STANDARD_CALIBRATION_MINIMUM_BAR,
): boolean {
  const overallRank: Record<GoldStandardCalibration["overallCalibration"], number> = {
    off_target: 0,
    close: 1,
    aligned: 2,
  };

  if (overallRank[calibration.overallCalibration] < overallRank[minimumBar.minimumOverallCalibration]) {
    return false;
  }

  const highSeverityGaps = calibration.topGaps.filter((gap) => gap.severity === "high").length;
  if (highSeverityGaps > minimumBar.maximumHighSeverityGaps) {
    return false;
  }

  for (const [key, minimumValue] of Object.entries(minimumBar.minimumDimensionScores)) {
    const dimensionKey = key as keyof GoldStandardCalibrationDimensionScores;
    if (calibration.dimensionScores[dimensionKey] < minimumValue) {
      return false;
    }
  }

  return true;
}
