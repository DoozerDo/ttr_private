import type { NormalizedCoverLetterDocument } from '../documents/normalized-document.models';
import type { StructuredBaseline } from '../baseline/structuredBaselineExtractor';
import type { CoverLetterGenerationResult } from './generators/cover-letter-generator.interface';
import type { AllowedBaselineBlock } from './generators/cover-letter-generator.interface';
import { CoverLetterNarrativeComposer } from '../composition/cover-letter-narrative-composer';
import {
  extractEvidenceUnitsFromLogicalUnits,
  reconstructLogicalTextUnits,
} from '../resume/resume-draft-bullets';

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function classifyEvidenceText(
  text: string,
): 'accomplishment' | 'responsibility' | 'outcome' | 'operational_result' {
  const lowered = trimToText(text).toLowerCase();
  if (/(reduced|improved|increased|delivered|launched|optimized|automated|saved|accelerated|cut|raised)/.test(lowered)) {
    return 'outcome';
  }
  if (/(led|owned|managed|coordinated|partnered|supported|operated|oversaw)/.test(lowered)) {
    return 'responsibility';
  }
  if (/(incident|escalation|workflow|queue|service|support|operations|operational|reliab)/.test(lowered)) {
    return 'operational_result';
  }
  return 'accomplishment';
}

function looksLikeMetadataFragment(text: string): boolean {
  const normalized = trimToText(text);
  if (!normalized) return true;
  if (normalized.includes('|')) return true;
  if (/^\d{4}\s*[-\-â€“â€”]\s*\d{4}$/.test(normalized)) return true;
  if (/^(?:summary|experience|education|skills|certifications)$/i.test(normalized)) return true;
  return false;
}

export type CanonicalEvidenceUnit = {
  id: string;
  text: string;
  sourceBlockId: string;
  sourceSectionType: AllowedBaselineBlock['sectionType'];
  classification: 'accomplishment' | 'responsibility' | 'outcome' | 'operational_result';
  verificationState: 'verified';
  eligibleForNarrativeComposition: true;
};

export function toCanonicalEvidenceUnits(input: {
  allowedBlocks?: AllowedBaselineBlock[];
  evidenceUnits?: CanonicalEvidenceUnit[];
}): CanonicalEvidenceUnit[] {
  if (Array.isArray(input.evidenceUnits) && input.evidenceUnits.length > 0) {
    return input.evidenceUnits
      .map((unit) => ({
        id: trimToText(unit.id),
        text: trimToText(unit.text),
        sourceBlockId: trimToText(unit.sourceBlockId),
        sourceSectionType: unit.sourceSectionType,
        classification: unit.classification,
        verificationState: 'verified' as const,
        eligibleForNarrativeComposition: true as const,
      }))
      .filter((unit) => Boolean(unit.id && unit.text && unit.sourceBlockId));
  }

  const allowedBlocks = input.allowedBlocks ?? [];
  const canonicalBlocks = Array.isArray(allowedBlocks)
    ? allowedBlocks.filter((block) => {
        const sectionType = String(block?.sectionType ?? '').toUpperCase();
        return ['EXPERIENCE', 'SUMMARY', 'SKILLS', 'PROJECT'].includes(sectionType);
      })
    : [];

  const units: CanonicalEvidenceUnit[] = [];

  for (const block of canonicalBlocks) {
    const blockId = String(block?.id ?? '').trim();
    const content = trimToText(block?.content ?? '');
    if (!blockId || !content) continue;

    if (String(block?.sectionType ?? '').toUpperCase() === 'SKILLS') {
      content
        .split(/(?:\r?\n|,|;|•|\u2022)+/)
        .map((piece) => trimToText(piece))
        .filter(Boolean)
        .filter((piece) => !looksLikeMetadataFragment(piece))
        .forEach((piece, pieceIndex) => {
          units.push({
            id: `${blockId}:evidence:0:${pieceIndex}`,
            text: piece,
            sourceBlockId: blockId,
            sourceSectionType: block.sectionType,
            classification: classifyEvidenceText(piece),
            verificationState: 'verified' as const,
            eligibleForNarrativeComposition: true,
          });
        });
      continue;
    }

    const logicalUnits = reconstructLogicalTextUnits(block.content ?? '');
    const extractedUnits = extractEvidenceUnitsFromLogicalUnits(blockId, logicalUnits, {
      allowImplicitBullets: true,
    });

    const canonicalTexts = extractedUnits
      .map((unit, index) => ({
        id: unit.id || `${blockId}:evidence:${index}`,
        text: trimToText(unit.normalizedText ?? unit.sourceText ?? ''),
      }))
      .filter((unit) => Boolean(unit.text))
      .filter((unit) => !looksLikeMetadataFragment(unit.text));

    canonicalTexts.forEach((unit) => {
      units.push({
        id: unit.id,
        text: unit.text,
        sourceBlockId: blockId,
        sourceSectionType: block.sectionType,
        classification: classifyEvidenceText(unit.text),
        verificationState: 'verified' as const,
        eligibleForNarrativeComposition: true,
      });
    });
  }

  return units;
}

export type CoverLetterAssemblyResult = {
  document: NormalizedCoverLetterDocument;
  paragraphEvidence: NonNullable<CoverLetterGenerationResult['paragraphEvidence']>;
};

export function assembleCoverLetterFromStructuredBaseline(opts: {
  structured: StructuredBaseline;
  senderName: string;
  senderContactLine?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  allowedBlocks?: AllowedBaselineBlock[];
  evidenceUnits?: CanonicalEvidenceUnit[];
}): CoverLetterAssemblyResult {
  const senderName = trimToText(opts.senderName);
  const senderContactLine = trimToText(opts.senderContactLine ?? '');
  const structuredSummary = trimToText((opts.structured as any)?.summary ?? '');
  const evidenceUnits = toCanonicalEvidenceUnits({
    allowedBlocks: opts.allowedBlocks,
    evidenceUnits: opts.evidenceUnits,
  });
  const composer = new CoverLetterNarrativeComposer();
  const composition = composer.compose({
    thesis: structuredSummary || null,
    evidenceUnits,
    jobCompany: trimToText(opts.companyName ?? '') || null,
    jobTitle: trimToText(opts.jobTitle ?? '') || null,
    maxBodyParagraphs: 3,
  });

  return {
    document: {
      senderHeading: {
        name: senderName,
        ...(senderContactLine ? { contactLine: senderContactLine } : {}),
      },
      salutation: 'Dear Hiring Team,',
      opening: composition.opening,
      bodyParagraphs: composition.bodyParagraphs,
      closingParagraph: composition.closing || 'Thank you for your time and consideration.',
      signoff: 'Sincerely,',
      signatureName: senderName,
    },
    paragraphEvidence: composition.paragraphEvidence,
  };
}
