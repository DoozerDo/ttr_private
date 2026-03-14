import { CoverLetterDocxModel } from '../docx-template.types';
import type {
  CoverLetterGenerationResult,
} from '../../cover-letters/generators/cover-letter-generator.interface';
import type { BaselineIdentity } from '../../baseline/baseline-identity.utils';

export function mapCoverLetterResultToModel(
  generation: CoverLetterGenerationResult,
  identity?: BaselineIdentity,
  job?: { title?: string | null; company?: string | null },
  options?: { dateLine?: string },
): CoverLetterDocxModel {
  const addresseeLinesRaw = [
    job?.title?.trim().replace(/\s+/g, ' '),
    job?.company?.trim().replace(/\s+/g, ' '),
  ];
  const addresseeLines = addresseeLinesRaw.filter(
    (line): line is string =>
      typeof line === 'string' && line.trim().length > 0,
  );

  if (generation.document) {
    return {
      dateLine: generation.document.dateLine ?? options?.dateLine,
      addresseeLines:
        generation.document.recipientLine?.length
          ? generation.document.recipientLine
          : addresseeLines.length
            ? addresseeLines
            : undefined,
      greeting: generation.document.salutation,
      paragraphs: [
        generation.document.opening,
        ...generation.document.bodyParagraphs,
        generation.document.closingParagraph,
      ].filter((paragraph) => paragraph.trim().length > 0),
      closingLines: [generation.document.signoff].filter(Boolean),
      signatureName:
        generation.document.signatureName?.trim() ||
        identity?.fullName?.trim() ||
        undefined,
    };
  }

  return {
    dateLine: options?.dateLine,
    addresseeLines: addresseeLines.length ? addresseeLines : undefined,
    greeting: generation.greeting,
    paragraphs: generation.paragraphs,
    closingLines: generation.closingParagraphs.length
      ? generation.closingParagraphs
      : undefined,
    signatureName: identity?.fullName?.trim() || undefined,
  };
}
