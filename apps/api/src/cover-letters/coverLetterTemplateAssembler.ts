import type { NormalizedCoverLetterDocument } from '../documents/normalized-document.models';
import type { StructuredBaseline } from '../baseline/structuredBaselineExtractor';

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function assembleCoverLetterFromStructuredBaseline(opts: {
  structured: StructuredBaseline;
  senderName: string;
  senderContactLine?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
}): NormalizedCoverLetterDocument {
  const { structured } = opts;
  const jobTitle = trimToText(opts.jobTitle ?? '');
  const companyName = trimToText(opts.companyName ?? '');
  const senderName = trimToText(opts.senderName);
  const senderContactLine = trimToText(opts.senderContactLine ?? '');

  const opening = (() => {
    const roleClause = jobTitle ? ` for the ${jobTitle} role` : '';
    const companyClause = companyName ? ` at ${companyName}` : '';
    return `I’m excited to apply${roleClause}${companyClause}.`;
  })();

  const baselineSummary = structured.summary ? trimToText(structured.summary) : '';
  const topExperience = structured.experience?.[0];
  const secondExperience = structured.experience?.[1];
  const topBullets = (topExperience?.bullets ?? []).slice(0, 2).map(trimToText).filter(Boolean);
  const secondBullets = (secondExperience?.bullets ?? []).slice(0, 2).map(trimToText).filter(Boolean);

  const bodyParagraphs: string[] = [];
  if (baselineSummary) {
    bodyParagraphs.push(baselineSummary);
  }
  if (topExperience && (topBullets.length || topExperience.roleTitle)) {
    const header = `${trimToText(topExperience.roleTitle)} at ${trimToText(topExperience.company)}`.trim();
    const bulletSentence = topBullets.length ? `Highlights include: ${topBullets.join(' ')}` : '';
    bodyParagraphs.push([header, bulletSentence].filter(Boolean).join('. ').replace(/\.\./g, '.'));
  }
  if (secondExperience && secondBullets.length) {
    bodyParagraphs.push(`Additional experience: ${secondBullets.join(' ')}`);
  }

  // Keep within 3-5 concise paragraphs: ensure at least 3 (opening + 1-2 body + closing) and no more than 5 body.
  const normalizedBody = bodyParagraphs.map((p) => trimToText(p)).filter(Boolean).slice(0, 3);

  return {
    senderHeading: {
      name: senderName,
      ...(senderContactLine ? { contactLine: senderContactLine } : {}),
    },
    salutation: 'Dear Hiring Team,',
    opening,
    bodyParagraphs: normalizedBody,
    closingParagraph: 'Thank you for your time and consideration.',
    signoff: 'Sincerely,',
    signatureName: senderName,
  };
}

