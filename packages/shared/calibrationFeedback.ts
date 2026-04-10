import type { DocumentStrategyPlan } from "./documentStrategyPlan";
import type { GoldStandardCalibration, GoldStandardCalibrationGapType } from "./goldStandardCalibration";

export type CalibrationFeedbackTargetSubsystem =
  | "strategy_plan"
  | "quality_pass"
  | "refinement_bias"
  | "language_style";

export type CalibrationFeedbackAction =
  | "increase_weight"
  | "decrease_weight"
  | "promote_signal"
  | "suppress_signal"
  | "tighten_language";

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

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueAdjustments(adjustments: CalibrationFeedbackAdjustment[]): CalibrationFeedbackAdjustment[] {
  const seen = new Set<string>();
  const result: CalibrationFeedbackAdjustment[] = [];
  for (const adjustment of adjustments) {
    const key = `${adjustment.targetSubsystem}|${adjustment.action}|${normalizeText(adjustment.focus)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(adjustment);
  }
  return result;
}

function gapStrength(severity: "high" | "medium" | "low"): "high" | "medium" | "low" {
  return severity;
}

function gapToAdjustments(
  gap: GoldStandardCalibrationGapType,
  plan: CalibrationFeedbackInput["plan"],
): CalibrationFeedbackAdjustment[] {
  const rolePriority = plan.roleLens.priorities[0] ?? "role priorities";
  const positioningFrame = plan.positioningFrame;
  const topNarrativeAxis = plan.qualityPass.topNarrativeAxes[0] ?? rolePriority;
  const coverTheme = plan.qualityPass.coverLetterDelta[0] ?? positioningFrame;

  switch (gap) {
    case "framing_weaker_than_benchmark":
      return [
        {
          targetSubsystem: "strategy_plan",
          action: "promote_signal",
          focus: positioningFrame,
          strength: "high",
        },
        {
          targetSubsystem: "quality_pass",
          action: "increase_weight",
          focus: "summary framing",
          strength: "medium",
        },
      ];
    case "evidence_too_diffuse":
      return [
        {
          targetSubsystem: "strategy_plan",
          action: "suppress_signal",
          focus: "lower-relevance background",
          strength: "high",
        },
        {
          targetSubsystem: "strategy_plan",
          action: "increase_weight",
          focus: rolePriority,
          strength: "high",
        },
        {
          targetSubsystem: "refinement_bias",
          action: "promote_signal",
          focus: topNarrativeAxis,
          strength: "medium",
        },
      ];
    case "important_proof_not_visible_early":
      return [
        {
          targetSubsystem: "strategy_plan",
          action: "promote_signal",
          focus: topNarrativeAxis,
          strength: "high",
        },
        {
          targetSubsystem: "refinement_bias",
          action: "promote_signal",
          focus: "bullet ranking",
          strength: "medium",
        },
      ];
    case "cover_letter_too_generic":
      return [
        {
          targetSubsystem: "quality_pass",
          action: "increase_weight",
          focus: coverTheme,
          strength: "high",
        },
        {
          targetSubsystem: "language_style",
          action: "tighten_language",
          focus: "cover letter opening",
          strength: "high",
        },
        {
          targetSubsystem: "refinement_bias",
          action: "promote_signal",
          focus: "role fit",
          strength: "medium",
        },
      ];
    case "language_less_sharp":
      return [
        {
          targetSubsystem: "language_style",
          action: "tighten_language",
          focus: "generic phrases and verbose openings",
          strength: "high",
        },
        {
          targetSubsystem: "quality_pass",
          action: "increase_weight",
          focus: "sharper language",
          strength: "medium",
        },
      ];
    case "suppression_too_weak":
      return [
        {
          targetSubsystem: "strategy_plan",
          action: "suppress_signal",
          focus: "lower-relevance background",
          strength: "high",
        },
        {
          targetSubsystem: "quality_pass",
          action: "suppress_signal",
          focus: "suppression notes",
          strength: "medium",
        },
      ];
    case "role_signal_underweighted":
      return [
        {
          targetSubsystem: "strategy_plan",
          action: "increase_weight",
          focus: rolePriority,
          strength: "high",
        },
        {
          targetSubsystem: "refinement_bias",
          action: "increase_weight",
          focus: "role signal visibility",
          strength: "medium",
        },
      ];
  }
}

function scoreFromStrength(strength: CalibrationFeedbackAdjustment["strength"]): number {
  return strength === "high" ? 4 : strength === "medium" ? 2 : 1;
}

function dimensionBasedFallbacks(
  calibration: CalibrationFeedbackInput["calibration"],
  plan: CalibrationFeedbackInput["plan"],
): CalibrationFeedbackAdjustment[] {
  const adjustments: CalibrationFeedbackAdjustment[] = [];
  const add = (
    targetSubsystem: CalibrationFeedbackTargetSubsystem,
    action: CalibrationFeedbackAction,
    focus: string,
    strength: CalibrationFeedbackAdjustment["strength"],
  ) => {
    adjustments.push({ targetSubsystem, action, focus, strength });
  };

  if (calibration.dimensionScores.framingAlignment < 80) {
    add("strategy_plan", "promote_signal", plan.positioningFrame, "medium");
  }
  if (calibration.dimensionScores.evidenceSelectionQuality < 80) {
    add("strategy_plan", "suppress_signal", "weak evidence", "medium");
  }
  if (calibration.dimensionScores.rolePriorityVisibility < 80) {
    add("refinement_bias", "promote_signal", plan.roleLens.priorities[0] ?? "role priorities", "medium");
  }
  if (calibration.dimensionScores.coverLetterSpecificity < 80) {
    add("language_style", "tighten_language", "cover letter opening", "medium");
  }
  if (calibration.dimensionScores.languageSharpness < 82) {
    add("language_style", "tighten_language", "generic phrases", "medium");
  }
  if (calibration.dimensionScores.suppressionDiscipline < 80) {
    add("quality_pass", "suppress_signal", "low-relevance background", "medium");
  }
  if (calibration.dimensionScores.crossArtifactConsistency < 80) {
    add("refinement_bias", "increase_weight", "shared role story", "medium");
  }
  return adjustments;
}

export function buildCalibrationFeedback(input: CalibrationFeedbackInput): CalibrationFeedback {
  const adjustments = [
    ...input.calibration.topGaps.flatMap((gap) => gapToAdjustments(gap.type, input.plan)),
    ...dimensionBasedFallbacks(input.calibration, input.plan),
  ];

  if (input.calibration.overallCalibration === "off_target") {
    adjustments.push({
      targetSubsystem: "strategy_plan",
      action: "promote_signal",
      focus: input.plan.positioningFrame,
      strength: "high",
    });
  }

  return {
    adjustments: uniqueAdjustments(adjustments).sort((a, b) => {
      const strengthDelta = scoreFromStrength(b.strength) - scoreFromStrength(a.strength);
      if (strengthDelta !== 0) return strengthDelta;
      const subsystemDelta = a.targetSubsystem.localeCompare(b.targetSubsystem);
      if (subsystemDelta !== 0) return subsystemDelta;
      return a.focus.localeCompare(b.focus);
    }),
  };
}

export function calibrationFeedbackHasAdjustment(
  feedback: CalibrationFeedback | null | undefined,
  targetSubsystem: CalibrationFeedbackTargetSubsystem,
  actions?: CalibrationFeedbackAction[],
): boolean {
  if (!feedback) return false;
  return feedback.adjustments.some((adjustment) => {
    if (adjustment.targetSubsystem !== targetSubsystem) return false;
    if (!actions || !actions.length) return true;
    return actions.includes(adjustment.action);
  });
}

export function calibrationFeedbackBoostForText(
  feedback: CalibrationFeedback | null | undefined,
  text: string,
  targetSubsystem?: CalibrationFeedbackTargetSubsystem,
): number {
  if (!feedback) return 0;
  const lowered = normalizeText(text);
  return feedback.adjustments.reduce((total, adjustment) => {
    if (targetSubsystem && adjustment.targetSubsystem !== targetSubsystem) return total;
    const focus = normalizeText(adjustment.focus);
    if (!focus) return total;
    if (!lowered.includes(focus) && !focus.split(/\s+/).some((token) => token.length > 3 && lowered.includes(token))) {
      return total;
    }
    const score = scoreFromStrength(adjustment.strength);
    if (adjustment.action === "increase_weight" || adjustment.action === "promote_signal" || adjustment.action === "tighten_language") {
      return total + score;
    }
    return total - score;
  }, 0);
}

export function calibrationFeedbackShouldTightenLanguage(
  feedback: CalibrationFeedback | null | undefined,
): boolean {
  return calibrationFeedbackHasAdjustment(feedback, "language_style", ["tighten_language"]) ||
    calibrationFeedbackHasAdjustment(feedback, "quality_pass", ["increase_weight"]) ||
    calibrationFeedbackHasAdjustment(feedback, "strategy_plan", ["promote_signal"]);
}
