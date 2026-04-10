import type { DocumentStrategyPlan } from "./documentStrategyPlan";
import type { GoldStandardCalibration } from "./goldStandardCalibration";
export type CalibrationFeedbackTargetSubsystem = "strategy_plan" | "quality_pass" | "refinement_bias" | "language_style";
export type CalibrationFeedbackAction = "increase_weight" | "decrease_weight" | "promote_signal" | "suppress_signal" | "tighten_language";
export type CalibrationFeedbackAdjustment = {
    targetSubsystem: CalibrationFeedbackTargetSubsystem;
    action: CalibrationFeedbackAction;
    focus: string;
    strength: "high" | "medium" | "low";
};
export type CalibrationFeedback = {
    adjustments: CalibrationFeedbackAdjustment[];
};
export type CalibrationFeedbackInput = {
    calibration: Pick<GoldStandardCalibration, "overallCalibration" | "topGaps" | "dimensionScores">;
    plan: Pick<DocumentStrategyPlan, "positioningFrame" | "roleLens" | "qualityPass" | "selectedEvidence">;
};
export declare function buildCalibrationFeedback(input: CalibrationFeedbackInput): CalibrationFeedback;
export declare function calibrationFeedbackHasAdjustment(feedback: CalibrationFeedback | null | undefined, targetSubsystem: CalibrationFeedbackTargetSubsystem, actions?: CalibrationFeedbackAction[]): boolean;
export declare function calibrationFeedbackBoostForText(feedback: CalibrationFeedback | null | undefined, text: string, targetSubsystem?: CalibrationFeedbackTargetSubsystem): number;
export declare function calibrationFeedbackShouldTightenLanguage(feedback: CalibrationFeedback | null | undefined): boolean;
