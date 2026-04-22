export const DOCUMENT_GENERATION_UNLOCK_SCORE_FLOOR = 70;
export const MOMENTUM_GENERATION_SCORE_FLOOR = 80;
// Product contract: score >= 80 should always generate now (no evidence-based blocking).
export const GENERATE_NOW_SCORE_FLOOR = MOMENTUM_GENERATION_SCORE_FLOOR;

export { shouldGenerateDocuments } from "@/lib/documentGenerationContract";

export function isDocumentGenerationUnlocked(score: number | null | undefined): boolean {
  return (
    typeof score === "number" &&
    Number.isFinite(score) &&
    score >= DOCUMENT_GENERATION_UNLOCK_SCORE_FLOOR
  );
}

export function isMomentumGenerationAllowed(score: number | null | undefined): boolean {
  return (
    typeof score === "number" &&
    Number.isFinite(score) &&
    score >= MOMENTUM_GENERATION_SCORE_FLOOR
  );
}

// Alias with clearer intent for Studio gating and lifecycle flows.
export function isGenerateNowEligible(score: number | null | undefined): boolean {
  return isMomentumGenerationAllowed(score);
}
