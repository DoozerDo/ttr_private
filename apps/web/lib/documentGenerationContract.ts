export type DocumentGenerationMode = "draft" | "finalized";

const GENERATION_SCORE_FLOOR = 70;
const FINALIZED_SCORE_FLOOR = 80;

export function shouldGenerateDocuments(score: number | null | undefined): boolean {
  return typeof score === "number" && Number.isFinite(score) && score >= GENERATION_SCORE_FLOOR;
}

export function resolveDocumentGenerationMode(score: number | null | undefined): DocumentGenerationMode {
  if (!shouldGenerateDocuments(score)) return "draft";
  return typeof score === "number" && score >= FINALIZED_SCORE_FLOOR ? "finalized" : "draft";
}

export function isSystemOwnedFinalizedGeneration(score: number | null | undefined): boolean {
  return resolveDocumentGenerationMode(score) === "finalized";
}

