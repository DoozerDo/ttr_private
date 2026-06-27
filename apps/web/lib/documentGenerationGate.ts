import {
  WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR,
  WORKFLOW_UNLOCK_SCORE_FLOOR,
  isWorkflowDirectStudioEligible,
  isWorkflowGenerationUnlocked,
} from "@shared/workflowThresholds";

export const DOCUMENT_GENERATION_UNLOCK_SCORE_FLOOR = WORKFLOW_UNLOCK_SCORE_FLOOR;
export const MOMENTUM_GENERATION_SCORE_FLOOR = WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR;
// Product contract: scores at or above the direct-studio floor should always generate now (no evidence-based blocking).
export const GENERATE_NOW_SCORE_FLOOR = MOMENTUM_GENERATION_SCORE_FLOOR;

export { shouldGenerateDocuments } from "@/lib/documentGenerationContract";

export function isDocumentGenerationUnlocked(score: number | null | undefined): boolean {
  return isWorkflowGenerationUnlocked(score);
}

export function isMomentumGenerationAllowed(score: number | null | undefined): boolean {
  return isWorkflowDirectStudioEligible(score);
}

// Alias with clearer intent for Studio gating and lifecycle flows.
export function isGenerateNowEligible(score: number | null | undefined): boolean {
  return isMomentumGenerationAllowed(score);
}
