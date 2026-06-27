export const WORKFLOW_UNLOCK_SCORE_FLOOR = 70;
export const WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR = 80;

export const WORKFLOW_SCORE_THRESHOLDS = Object.freeze({
  unlock: WORKFLOW_UNLOCK_SCORE_FLOOR,
  directStudio: WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR,
});

function normalizeScore(score: number | null | undefined): number | null {
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

export function isWorkflowGenerationUnlocked(score: number | null | undefined): boolean {
  const normalized = normalizeScore(score);
  return normalized !== null && normalized >= WORKFLOW_UNLOCK_SCORE_FLOOR;
}

export function isWorkflowDirectStudioEligible(score: number | null | undefined): boolean {
  const normalized = normalizeScore(score);
  return normalized !== null && normalized >= WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR;
}

export function isWorkflowFitReviewBand(score: number | null | undefined): boolean {
  const normalized = normalizeScore(score);
  return normalized !== null && normalized >= WORKFLOW_UNLOCK_SCORE_FLOOR && normalized < WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR;
}

