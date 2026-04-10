import { buildLanguageStylePass } from "../language-style-pass";
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
  id?: string;
  description?: string;
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

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function includesAny(text: string, values: string[]): boolean {
  const lowered = normalizeLower(text);
  return values.some((value) => lowered.includes(normalizeLower(value)));
}

function score(outOf100: number): number {
  return Math.max(0, Math.min(100, Math.round(outOf100)));
}

export function buildGoldStandardCalibration(input: GoldStandardCalibrationInput): GoldStandardCalibration {
  const resumeText = normalizeText(input.generatedResume.summary + " " + input.generatedResume.bullets.join(" "));
  const coverText = normalizeText(
    [input.generatedCoverLetter.opening, ...input.generatedCoverLetter.bodyParagraphs, input.generatedCoverLetter.closingParagraph].join(" "),
  );
  const planText = normalizeText([input.plan.positioningFrame, ...input.plan.roleLens.priorities, ...input.plan.roleLens.requiredSignals].join(" "));
  const benchmarkText = normalizeText(
    [
      input.benchmark.benchmarkPositioningFrame,
      input.benchmark.approvedBenchmarkResume.summary,
      ...input.benchmark.approvedBenchmarkResume.bullets,
      input.benchmark.approvedBenchmarkCoverLetter.opening,
      ...input.benchmark.approvedBenchmarkCoverLetter.bodyParagraphs,
      input.benchmark.approvedBenchmarkCoverLetter.closingParagraph,
    ].join(" "),
  );

  const framingAlignment = score(
    includesAny(planText, [input.benchmark.benchmarkPositioningFrame]) ? 92 : 62,
  );
  const evidenceSelectionQuality = score(input.plan.selectedEvidence.length ? 88 : 54);
  const suppressionDiscipline = score(input.plan.suppressionNotes.length ? 86 : 58);
  const resumeClarity = score(resumeText.length > 0 ? 84 : 44);
  const coverLetterSpecificity = score(includesAny(coverText, input.plan.roleLens.priorities) ? 88 : 50);
  const rolePriorityVisibility = score(includesAny(resumeText, input.plan.roleLens.priorities) ? 90 : 52);
  const languageSharpness = score(
    buildLanguageStylePass({
      plan: input.plan as any,
      roleLabel: input.plan.positioningFrame,
      resumeSummary: input.generatedResume.summary,
      resumeBullets: input.generatedResume.bullets,
      coverOpening: input.generatedCoverLetter.opening,
      coverParagraphs: [input.generatedCoverLetter.opening, ...input.generatedCoverLetter.bodyParagraphs, input.generatedCoverLetter.closingParagraph],
    }).issues.length > 0
      ? 68
      : 90,
  );
  const crossArtifactConsistency = score(
    includesAny(resumeText + " " + coverText, [input.benchmark.benchmarkPositioningFrame]) ? 90 : 60,
  );

  const dimensionScores = {
    framingAlignment,
    evidenceSelectionQuality,
    suppressionDiscipline,
    resumeClarity,
    coverLetterSpecificity,
    rolePriorityVisibility,
    languageSharpness,
    crossArtifactConsistency,
  };

  const topGaps: GoldStandardCalibrationGap[] =
    framingAlignment >= 80 && coverLetterSpecificity >= 80
      ? []
      : [
          {
            type: "framing_weaker_than_benchmark",
            severity: framingAlignment < 70 ? "high" : "medium",
            explanation: "Generated output does not fully match the benchmark frame.",
          },
        ];

  const overallCalibration: GoldStandardCalibration["overallCalibration"] =
    topGaps.length === 0 && Object.values(dimensionScores).every((value) => value >= 80)
      ? "aligned"
      : Object.values(dimensionScores).every((value) => value >= 65)
        ? "close"
        : "off_target";

  return {
    overallCalibration,
    dimensionScores,
    topGaps,
    benchmarkSummary: {
      strongestBenchmarkTraits: [input.benchmark.benchmarkPositioningFrame],
      missingInGeneratedOutput: topGaps.map((gap) => gap.explanation),
    },
    recommendedSystemAdjustments: topGaps.length
      ? ["Tighten frame alignment", "Increase role-specific evidence visibility"]
      : [],
  };
}

export function meetsGoldStandardCalibrationMinimumBar(
  calibration: GoldStandardCalibration,
  minimumBar: GoldStandardCalibrationMinimumBar = {
    minimumOverallCalibration: "close",
    minimumDimensionScores: {
      framingAlignment: 70,
      evidenceSelectionQuality: 65,
      suppressionDiscipline: 65,
      resumeClarity: 65,
      coverLetterSpecificity: 65,
      rolePriorityVisibility: 65,
      languageSharpness: 65,
      crossArtifactConsistency: 65,
    },
    maximumHighSeverityGaps: 1,
  },
): boolean {
  if (calibration.overallCalibration === "off_target") return false;
  if (
    minimumBar.minimumOverallCalibration === "aligned" &&
    calibration.overallCalibration !== "aligned"
  ) {
    return false;
  }

  for (const [key, threshold] of Object.entries(minimumBar.minimumDimensionScores)) {
    if (calibration.dimensionScores[key as keyof GoldStandardCalibrationDimensionScores] < threshold) {
      return false;
    }
  }

  const highSeverityCount = calibration.topGaps.filter((gap) => gap.severity === "high").length;
  return highSeverityCount <= minimumBar.maximumHighSeverityGaps;
}
