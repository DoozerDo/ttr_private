import { type CalibrationFeedback } from "./calibrationFeedback";
import type { DocumentStrategyPlan } from "./documentStrategyPlan";
export type LanguageStyleIssueType = "generic_phrase" | "repetition_pattern" | "ai_cadence" | "overly_verbose" | "weak_opening" | "redundant_modifier";
export type LanguageStyleIssue = {
    type: LanguageStyleIssueType;
    severity: "high" | "medium" | "low";
    location: string;
};
export type LanguageStylePass = {
    issues: LanguageStyleIssue[];
    transformationsApplied: string[];
};
export type LanguageStylePassInput = {
    plan: DocumentStrategyPlan;
    roleLabel?: string | null;
    resumeSummary?: string | null;
    resumeBullets?: string[] | null;
    coverOpening?: string | null;
    coverParagraphs?: string[] | null;
    feedback?: CalibrationFeedback | null;
};
export type ResumeDocumentLike = {
    summary?: string;
    experience?: Array<{
        bullets?: string[];
    }>;
};
export type CoverLetterDocumentLike = {
    salutation?: string;
    opening: string;
    bodyParagraphs: string[];
    closingParagraph: string;
    signoff?: string;
    signatureName?: string;
};
export declare function buildLanguageStylePass(input: LanguageStylePassInput): LanguageStylePass;
export declare function polishResumeSummaryText(summary: string, input: LanguageStylePassInput, pass: LanguageStylePass): string;
export declare function polishResumeBulletsText(bullets: string[], pass: LanguageStylePass, input?: LanguageStylePassInput): string[];
export declare function polishCoverLetterParagraphsText(paragraphs: string[], input: LanguageStylePassInput, pass: LanguageStylePass): string[];
