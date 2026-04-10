import { type CalibrationFeedback } from "./calibrationFeedback";
export type DocumentStrategyFitBand = "strong" | "moderate" | "borderline" | null;
export type DocumentQualityFramingStrength = "high" | "medium" | "low";
export type DocumentQualityEmphasisConfidence = "high" | "medium" | "low";
export type DocumentQualityPass = {
    framingStrength: DocumentQualityFramingStrength;
    emphasisConfidence: DocumentQualityEmphasisConfidence;
    topNarrativeAxes: string[];
    cutCandidates: string[];
    mustLeadWith: string[];
    avoidRepeating: string[];
    coverLetterDelta: string[];
};
export type DocumentStrategyRoleLens = {
    titleFamily: string | null;
    seniority: string | null;
    scope: string | null;
    domainContext: string | null;
    priorities: string[];
    requiredSignals: string[];
    targetKeywords: string[];
};
export type DocumentStrategyEvidence = {
    baselineSection: string;
    sourceId: string;
    matchedSignals: string[];
    whySelected: string;
    approvedClaims: string[];
    rank?: number;
    score?: number;
};
export type DocumentStrategyPlan = {
    fitScore: number | null;
    fitBand: DocumentStrategyFitBand;
    positioningFrame: string;
    roleLens: DocumentStrategyRoleLens;
    selectedEvidence: DocumentStrategyEvidence[];
    summaryStrategy: string;
    resumeEmphasis: string[];
    coverLetterThemes: string[];
    suppressionNotes: string[];
    qualityPass: DocumentQualityPass;
    documentQualityScore: number;
};
export type DocumentStrategyPlanInput = {
    fitScore: number | null;
    jobTitle?: string | null;
    jobCompany?: string | null;
    jobDescription?: string | null;
    jobRequirements?: string[];
    jobResponsibilities?: string[];
    analysisSummary?: string | null;
    analysisStrengths?: string[] | null;
    analysisGaps?: string[] | null;
    analysisRecommendedActions?: string[] | null;
    baselineSections?: Array<{
        id?: string | null;
        title?: string | null;
        content?: string | null;
        sectionType?: string | null;
    }>;
    refinements?: RefinementInstruction[] | null;
};
export type RefinementInstructionType = "emphasis_shift" | "tone_adjustment" | "evidence_swap" | "summary_rewrite" | "bullet_focus" | "cover_letter_focus";
export type RefinementTarget = "resume" | "cover_letter" | "both";
export type RefinementInstructionConstraints = {
    preservePositioningFrame: boolean;
    preserveSelectedEvidence: boolean;
    allowNewEvidenceFromBaseline: boolean;
};
export type RefinementInstruction = {
    type: RefinementInstructionType;
    target: RefinementTarget;
    instruction: string;
    constraints: RefinementInstructionConstraints;
};
export type RefinementPreset = RefinementInstruction & {
    key: string;
    label: string;
    description: string;
};
export type DocumentStrategyPlanSummaryModel = {
    positioning: string;
    emphasis: string;
    coverLetter: string;
    evidence: string[];
    suppression: string[];
    quality: string;
};
export declare const REFINEMENT_PRESETS: RefinementPreset[];
export declare function resolveRefinementTargets(instruction: RefinementInstruction): RefinementTarget[];
export declare function buildDocumentStrategyPlan(input: DocumentStrategyPlanInput, feedback?: CalibrationFeedback | null): DocumentStrategyPlan;
export declare function buildDocumentStrategyPlanSummary(plan: DocumentStrategyPlan): DocumentStrategyPlanSummaryModel;
