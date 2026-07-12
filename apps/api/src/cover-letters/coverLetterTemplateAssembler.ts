import type { NormalizedCoverLetterDocument } from '../documents/normalized-document.models';
import type { StructuredBaseline } from '../baseline/structuredBaselineExtractor';
import { CoverLetterNarrativeComposer } from '../composition/cover-letter-narrative-composer';

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toEvidenceSnippets(structured: StructuredBaseline) {
  return (structured.experience ?? [])
    .map((entry: any, index) => {
      const bullets = Array.isArray(entry?.bullets)
        ? entry.bullets.map(trimToText).filter(Boolean)
        : [];
      const header = [entry?.company, entry?.roleTitle, entry?.dates]
        .map(trimToText)
        .filter(Boolean)
        .join(' | ');
      const text = [header, ...bullets].filter(Boolean).join(' ').trim();
      return {
        id: String(entry?.id ?? entry?.roleId ?? `experience-${index + 1}`),
        text,
        roleId: String(entry?.id ?? entry?.roleId ?? `experience-${index + 1}`),
      };
    })
    .filter((snippet) => snippet.text.length > 0);
}

export function assembleCoverLetterFromStructuredBaseline(opts: {
  structured: StructuredBaseline;
  senderName: string;
  senderContactLine?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
}): NormalizedCoverLetterDocument {
  const senderName = trimToText(opts.senderName);
  const senderContactLine = trimToText(opts.senderContactLine ?? '');
  const structuredSummary = trimToText((opts.structured as any)?.summary ?? '');
  const composer = new CoverLetterNarrativeComposer();
  const composition = composer.compose({
    thesis: structuredSummary || null,
    evidenceSnippets: toEvidenceSnippets(opts.structured),
    jobCompany: trimToText(opts.companyName ?? '') || null,
    jobTitle: trimToText(opts.jobTitle ?? '') || null,
    maxBodyParagraphs: 3,
  });

  return {
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
  };
}
