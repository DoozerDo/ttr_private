import type {
  AllowedBaselineBlock,
  CoverLetterGenerationInput,
  CoverLetterGenerationResult,
  CoverLetterGenerator,
  CoverLetterJobContext,
} from './cover-letter-generator.interface';
import type { CoverLetterComplianceConstraints } from '../types/cover-letter-compliance-constraints';
import type { CanonicalCoverLetterDocument } from '../../documents/normalized-document.models';

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function countWords(text: string): number {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean).length;
}

function normalizeParagraphs(document: CanonicalCoverLetterDocument): string[] {
  return [document.opening, ...(document.bodyParagraphs ?? []), document.closingParagraph]
    .map((part) => trimToText(part))
    .filter(Boolean);
}

export class TemplateCoverLetterGenerator implements CoverLetterGenerator {
  generate(input: CoverLetterGenerationInput): CoverLetterGenerationResult {
    if (!input.document) {
      throw new Error('Cover letter generator requires a canonical document.');
    }

    const document = input.document;
    const paragraphs = normalizeParagraphs(document);
    const content = paragraphs.join('\n\n');
    const wordCount = countWords(content);
    const traceMap = input.traceMap ?? {};
    const paragraphEvidence = input.paragraphEvidence ?? [];

    return {
      document,
      content,
      wordCount,
      greeting: document.salutation,
      paragraphs,
      closingParagraphs: [document.closingParagraph].filter(Boolean),
      salutation: document.salutation,
      closing: `${document.signoff}\n${document.signatureName}`,
      traceMap,
      paragraphEvidence,
      debugTrace: input.debugTrace ?? {
        passed: true,
        failures: [],
        traceCoverage: 1,
        unusedEvidence: [],
        selectedEvidence: [],
      },
      internalTrace: input.internalTrace,
      constraintSummary: input.constraintSummary ?? null,
    };
  }
}
