import {
  WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR,
  WORKFLOW_UNLOCK_SCORE_FLOOR,
  isWorkflowDirectStudioEligible,
  isWorkflowGenerationUnlocked,
} from "@shared/workflowThresholds";

export type DocumentGenerationMode = "draft" | "finalized";

export const DOCUMENT_GENERATION_UNLOCK_SCORE_FLOOR = WORKFLOW_UNLOCK_SCORE_FLOOR;
export const FINALIZED_DOCUMENT_GENERATION_SCORE_FLOOR = WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR;

export function shouldGenerateDocuments(score: number | null | undefined): boolean {
  return isWorkflowGenerationUnlocked(score);
}

export function resolveDocumentGenerationMode(score: number | null | undefined): DocumentGenerationMode {
  if (!shouldGenerateDocuments(score)) return "draft";
  return isWorkflowDirectStudioEligible(score) ? "finalized" : "draft";
}

export function isSystemOwnedFinalizedGeneration(score: number | null | undefined): boolean {
  return resolveDocumentGenerationMode(score) === "finalized";
}
