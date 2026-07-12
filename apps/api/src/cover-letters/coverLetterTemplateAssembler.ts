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

function toEvidenceSnippets(structured: StructuredBaseline, allowedBlocks?: AllowedBaselineBlock[]) {
  const canonicalBlocks = Array.isArray(allowedBlocks)
    ? allowedBlocks.filter((block) => String(block?.sectionType ?? '').toUpperCase() === 'EXPERIENCE')
    : [];
  if (canonicalBlocks.length > 0) {
    return canonicalBlocks.flatMap((block, index) => {
      const blockId = String(block?.id ?? `resume_v2_exp_${index}`);
      const logicalUnits = reconstructLogicalTextUnits(String(block?.content ?? ''));
      const evidenceUnits = extractEvidenceUnitsFromLogicalUnits(blockId, logicalUnits);
      return evidenceUnits.map((unit) => ({
        id: unit.id,
        text: trimToText(unit.normalizedText ?? unit.sourceText ?? ''),
        roleId: blockId,
      }));
    });
  }

  return (structured.experience ?? [])
    .map((entry: any, index) => {
      const bullets = Array.isArray(entry?.bullets)
        ? entry.bullets.map(trimToText).filter(Boolean)
        : [];
      const header = [entry?.company, entry?.roleTitle, trimToText(entry?.dates ?? '').replace(/\s*-\s*/g, ' to ')]
        .map(trimToText)
        .filter(Boolean)
        .join(' | ');
      const text = [header, ...bullets].filter(Boolean).join(' ').trim();
      return {
        id: `resume_v2_exp_${index}`,
        text,
        roleId: `resume_v2_exp_${index}`,
      };
    })
    .filter((snippet) => snippet.text.length > 0);
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
}): CoverLetterAssemblyResult {
  const senderName = trimToText(opts.senderName);
  const senderContactLine = trimToText(opts.senderContactLine ?? '');
  const structuredSummary = trimToText((opts.structured as any)?.summary ?? '');
  const composer = new CoverLetterNarrativeComposer();
  const composition = composer.compose({
    thesis: structuredSummary || null,
    evidenceSnippets: toEvidenceSnippets(opts.structured, opts.allowedBlocks),
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
