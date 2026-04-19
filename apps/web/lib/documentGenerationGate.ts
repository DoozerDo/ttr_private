export const DOCUMENT_GENERATION_UNLOCK_SCORE_FLOOR = 70;

export { shouldGenerateDocuments } from "@/lib/documentGenerationContract";

export function isDocumentGenerationUnlocked(score: number | null | undefined): boolean {
  return (
    typeof score === "number" &&
    Number.isFinite(score) &&
    score >= DOCUMENT_GENERATION_UNLOCK_SCORE_FLOOR
  );
}
