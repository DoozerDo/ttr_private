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
export type GoldStandardCalibrationGapType = "framing_weaker_than_benchmark" | "evidence_too_diffuse" | "important_proof_not_visible_early" | "cover_letter_too_generic" | "language_less_sharp" | "suppression_too_weak" | "role_signal_underweighted";
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
export declare function mapGoldStandardCalibrationGapToSubsystems(gap: GoldStandardCalibrationGapType): string[];
export declare const GOLD_STANDARD_BENCHMARK_FIXTURES: GoldStandardBenchmarkFixture[];
export declare function listGoldStandardBenchmarkFixtures(): GoldStandardBenchmarkFixture[];
export declare function getGoldStandardBenchmarkFixture(fixtureId: string): GoldStandardBenchmarkFixture | null;
export declare function buildGoldStandardCalibration(input: GoldStandardCalibrationInput): GoldStandardCalibration;
export declare function buildGoldStandardCalibrationReport(calibration: GoldStandardCalibration, benchmark: GoldStandardBenchmarkFixture): GoldStandardCalibrationReport;
export declare const GOLD_STANDARD_CALIBRATION_MINIMUM_BAR: GoldStandardCalibrationMinimumBar;
export declare function meetsGoldStandardCalibrationMinimumBar(calibration: GoldStandardCalibration, minimumBar?: GoldStandardCalibrationMinimumBar): boolean;
