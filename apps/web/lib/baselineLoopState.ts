import type { BaselineAssessmentSummaryDto, BaselineDto } from "@/lib/baselines";
import { isBaselineAnalyzedFromSummary, getLatestRoleAnalysisFitScore } from "@/lib/baselines";

export type BaselineAnalysisStatus = "NOT_ANALYZED" | "ANALYZING" | "READY";

export type BaselineLoopNextStep =
  | "UPLOAD_RESUME"
  | "ANALYZE_ROLE"
  | "IMPROVE_BASELINE"
  | "ADD_JOB_DESCRIPTION"
  | "SCORE_AVAILABLE";

export type BaselineLoopState = {
  hasActiveBaseline: boolean;
  activeBaselineId: string | null;
  isArchived: boolean;
  hasStructuredBaseline: boolean;
  isAnalyzed: boolean;
  analysisStatus: BaselineAnalysisStatus;
  effectivenessScore: number | null;
  isValidated: boolean;
  isReadyForJobInput: boolean;
  hasJobDescription: boolean;
  isReadyForScoring: boolean;
  nextStep: BaselineLoopNextStep;
  activeBaseline: BaselineDto | null;
};

const sortNewestFirst = (baselines: BaselineDto[]) =>
  [...baselines].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

const resolveActiveBaseline = (
  baselines: BaselineDto[],
  preferredBaselineId?: string | null,
) => {
  const activeBaselines = sortNewestFirst(baselines).filter((baseline) => baseline.status !== "ARCHIVED");
  if (!activeBaselines.length) return null;

  if (preferredBaselineId) {
    const selected = activeBaselines.find((baseline) => baseline.id === preferredBaselineId);
    if (selected) return selected;
  }

  return activeBaselines[0] ?? null;
};

const resolveAnalysisStatus = (summary?: BaselineAssessmentSummaryDto | null): BaselineAnalysisStatus => {
  if (!summary) return "NOT_ANALYZED";
  if (summary.hasCompletedAssessment === true) return "READY";
  if (summary.latestAssessmentId) return "ANALYZING";
  return "NOT_ANALYZED";
};

const resolveEffectivenessScore = (baseline: BaselineDto | null): number | null => {
  if (!baseline) return null;
  const candidates = [baseline.latestBaselineScore, baseline.originalBaselineScore];
  const score = candidates.find((value): value is number => typeof value === "number");
  return typeof score === "number" ? Math.max(0, Math.min(100, Math.round(score))) : null;
};

export function deriveBaselineLoopState(
  baselines: BaselineDto[],
  preferredBaselineId?: string | null,
  hasJobDescription = false,
): BaselineLoopState {
  const activeBaseline = resolveActiveBaseline(baselines, preferredBaselineId);
  const isArchived = Boolean(
    preferredBaselineId &&
      baselines.find((baseline) => baseline.id === preferredBaselineId)?.status === "ARCHIVED",
  );
  const analysisStatus = resolveAnalysisStatus(activeBaseline?.latestAssessmentSummary);
  const isAnalyzed = analysisStatus !== "NOT_ANALYZED";
  const hasStructuredBaseline = Boolean(activeBaseline?.sections?.length);
  const effectivenessScore = resolveEffectivenessScore(activeBaseline);
  const isValidated = isAnalyzed && effectivenessScore !== null && effectivenessScore >= 80;
  const isReadyForJobInput = hasStructuredBaseline && isAnalyzed && isValidated;
  const isReadyForScoring = isReadyForJobInput && hasJobDescription;

  let nextStep: BaselineLoopNextStep = "UPLOAD_RESUME";
  if (!activeBaseline) {
    nextStep = "UPLOAD_RESUME";
  } else if (analysisStatus === "NOT_ANALYZED") {
    nextStep = "ANALYZE_ROLE";
  } else if (!isValidated) {
    nextStep = "IMPROVE_BASELINE";
  } else if (isValidated && !hasJobDescription) {
    nextStep = "ADD_JOB_DESCRIPTION";
  } else if (isReadyForScoring) {
    nextStep = "SCORE_AVAILABLE";
  }

  return {
    hasActiveBaseline: Boolean(activeBaseline),
    activeBaselineId: activeBaseline?.id ?? null,
    isArchived,
    hasStructuredBaseline,
    isAnalyzed,
    analysisStatus,
    effectivenessScore,
    isValidated,
    isReadyForJobInput,
    hasJobDescription,
    isReadyForScoring,
    nextStep,
    activeBaseline,
  };
}
