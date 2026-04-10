import type { ResumeModel } from "./resumeModel";
import { type DocumentStrategyPlan, type RefinementPreset } from "./documentStrategyPlan";
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
export type RoleMatchFinalPassRiskType = "top_third_too_generic" | "missing_priority_signal" | "weak_keyword_presence" | "cover_letter_not_role_specific" | "proof_not_visible_early" | "theme_overload";
export type RoleMatchFinalPassRisk = {
    type: RoleMatchFinalPassRiskType;
    severity: "high" | "medium" | "low";
    explanation: string;
};
export type RoleMatchFinalAdjustmentType = "summary_tighten" | "bullet_reorder" | "keyword_tighten" | "cover_letter_role_focus";
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
export declare function buildRoleMatchFinalPass(input: RoleMatchFinalPassInput): RoleMatchFinalPass;
export declare function resolveRoleMatchFinalAdjustmentPreset(input: RoleMatchFinalPassInput, adjustment: RoleMatchFinalAdjustment): RefinementPreset | null;
export {};
