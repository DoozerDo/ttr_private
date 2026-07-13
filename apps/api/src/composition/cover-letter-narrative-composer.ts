import { GenericLanguageDetector } from './generic-language-detector';
import type {
  CanonicalCoverLetterParagraphEvidence,
  CanonicalCoverLetterParagraphKey,
} from '../documents/normalized-document.models';

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function ensureSentence(value: string): string {
  const text = trimToText(value);
  if (!text) return '';
  return /[.!?]\s*$/.test(text) ? text : `${text}.`;
}

function lowercaseFirst(value: string): string {
  const text = trimToText(value);
  if (!text) return '';
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function compactSnippet(text: string, maxWords = 28): string {
  const cleaned = trimToText(text).replace(/\|/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length > maxWords ? words.slice(0, maxWords).join(' ').trim() : cleaned;
}

function normalizeEvidenceGrammar(text: string): string {
  return trimToText(text)
    .replace(/\b(and)\s+\1\b/gi, '$1')
    .replace(/\.\s*,/g, '.')
    .replace(
      /,\s+(Owned|Built|Led|Managed|Partnered|Standardized|Coordinated|Drove|Improved|Implemented|Developed|Automated|Launched|Reduced|Maintained|Operated|Supported|Oversaw)\b/g,
      (_match, verb: string) => `, ${verb.toLowerCase()}`,
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceFromSnippet(text: string): string {
  const cleaned = ensureSentence(normalizeEvidenceGrammar(compactSnippet(text, 48)));
  return cleaned.replace(/^[\s-]+/, '').trim();
}

function deriveThemePhrase(text: string): string {
  const lowered = trimToText(text).toLowerCase();
  if (/(workflow design|queue health)/.test(lowered)) {
    return 'support workflow design and queue health';
  }
  if (/(dashboards?|kpi|reporting)/.test(lowered)) {
    return 'dashboards, KPI reporting, and executive communication';
  }
  if (/(incident response|service reliability|incident command)/.test(lowered)) {
    return 'incident response and service reliability';
  }
  if (/(ticketing|routing|handoff)/.test(lowered)) {
    return 'ticketing governance, routing, and handoff routines';
  }
  return compactSnippet(text, 12);
}

function jobContext(jobTitle?: string | null, jobCompany?: string | null): string {
  const title = trimToText(jobTitle ?? '');
  const company = trimToText(jobCompany ?? '');
  if (title && company) return `the ${title} role at ${company}`;
  if (title) return `the ${title} role`;
  if (company) return `the opportunity at ${company}`;
  return 'the role';
}

type CanonicalEvidenceUnit = {
  id: string;
  text: string;
  sourceBlockId: string;
  sourceSectionType: string;
  classification: 'accomplishment' | 'responsibility' | 'outcome' | 'operational_result';
  verificationState: 'verified';
  eligibleForNarrativeComposition: boolean;
};

type ParagraphKey = CanonicalCoverLetterParagraphKey;

function groupEvidenceBySourceBlock(evidenceUnits: CanonicalEvidenceUnit[]): CanonicalEvidenceUnit[][] {
  const groups: CanonicalEvidenceUnit[][] = [];
  const bySourceBlock = new Map<string, CanonicalEvidenceUnit[]>();
  for (const unit of evidenceUnits) {
    const blockId = trimToText(unit.sourceBlockId);
    if (!blockId) continue;
    let group = bySourceBlock.get(blockId);
    if (!group) {
      group = [];
      bySourceBlock.set(blockId, group);
      groups.push(group);
    }
    group.push(unit);
  }
  return groups.filter((group) => group.length > 0);
}

function buildParagraphEvidence(args: {
  paragraphKey: ParagraphKey;
  evidenceUnits: CanonicalEvidenceUnit[];
}): CanonicalCoverLetterParagraphEvidence {
  return {
    paragraphKey: args.paragraphKey,
    sourceEvidenceIds: args.evidenceUnits.map((unit) => unit.id).filter(Boolean),
    anchorTexts: args.evidenceUnits.map((unit) => compactSnippet(unit.text, 24)).filter(Boolean),
  };
}

function buildOpeningParagraph(args: {
  jobTitle?: string | null;
  jobCompany?: string | null;
  leadEvidence: CanonicalEvidenceUnit;
}): string {
  const roleContext = jobContext(args.jobTitle, args.jobCompany);
  const leadSentence = sentenceFromSnippet(args.leadEvidence.text);
  const operatingSentence = ensureSentence(
    `It reflects the operating rhythm I use when support, product, and engineering need the work to stay organized, measurable, and easy to act on.`,
  );
  const fitSentence = ensureSentence(
    `That is why I see ${roleContext} as a practical fit for the way I work and the kind of ownership I like to bring.`,
  );
  const contributionSentence = ensureSentence(
    `I try to keep the work grounded in clear priorities, visible follow through, and the kind of execution that makes a team easier to trust.`,
  );
  return [
    ensureSentence(
      `${roleContext.charAt(0).toUpperCase()}${roleContext.slice(1)} fits my background because it reflects the way I have led service quality, operating rhythm, and cross-functional execution.`,
    ),
    leadSentence,
    operatingSentence,
    fitSentence,
    contributionSentence,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function buildBodyParagraph(args: {
  jobTitle?: string | null;
  jobCompany?: string | null;
  primaryEvidence: CanonicalEvidenceUnit;
  secondaryEvidence?: CanonicalEvidenceUnit;
  paragraphIndex: 1 | 2;
}): string {
  const roleContext = jobContext(args.jobTitle, args.jobCompany);
  const sentences = [sentenceFromSnippet(args.primaryEvidence.text)];
  if (args.secondaryEvidence) {
    sentences.push(sentenceFromSnippet(args.secondaryEvidence.text));
  }

  const synthesis =
    args.paragraphIndex === 1
      ? `That work keeps ${roleContext} grounded in concrete ownership and visible service quality, while making handoffs and escalation paths easier to follow.`
      : `That mix of experience is a strong fit for ${roleContext} because it keeps support, engineering, and customer partners aligned, and it gives the team a practical way to move issues forward without losing accountability.`;

  const secondSynthesis =
    args.paragraphIndex === 1
      ? `It also creates a steady operating pattern that helps the team see where decisions happen and how work moves from one owner to the next.`
      : `It also makes it easier to keep priorities clear when the work spans service quality, operational follow through, and customer communication.`;

  return [...sentences, ensureSentence(synthesis), ensureSentence(secondSynthesis)]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function buildClosingParagraph(args: {
  jobTitle?: string | null;
  jobCompany?: string | null;
  evidence: CanonicalEvidenceUnit[];
}): string {
  const roleContext = jobContext(args.jobTitle, args.jobCompany);
  const themeSentence = args.evidence.length
    ? lowercaseFirst(
        normalizeEvidenceGrammar(
          deriveThemePhrase(
            args.evidence
              .map((unit) => unit.text)
              .join(' '),
          ),
        ),
      )
    : '';

  return [
    ensureSentence(
      `That mix of support operations rigor, incident response, and cross-functional leadership is why I would welcome a conversation about ${roleContext}${themeSentence ? `, especially given ${themeSentence}` : ''}.`,
    ),
    ensureSentence(
      `I would bring the same attention to detail, ownership, and steady communication to the work so the team can keep moving with confidence.`,
    ),
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

export class CoverLetterNarrativeComposer {
  private detector = new GenericLanguageDetector();

  compose(input: {
    thesis: string | null;
    evidenceUnits: CanonicalEvidenceUnit[];
    jobCompany?: string | null;
    jobTitle?: string | null;
    maxBodyParagraphs: number;
  }): {
    opening: string;
    bodyParagraphs: string[];
    closing: string;
    paragraphEvidence: CanonicalCoverLetterParagraphEvidence[];
    diagnostics: {
      genericLanguageFlags: ReturnType<GenericLanguageDetector['detect']>;
      renderedEvidenceSnippetIds: string[];
      narrativeStrategy: string;
    };
  } {
    void input.thesis;
    const evidenceUnits = input.evidenceUnits
      .filter((unit) => unit?.eligibleForNarrativeComposition !== false)
      .filter((unit) => {
        const sectionType = String(unit?.sourceSectionType ?? '').toUpperCase();
        return sectionType === 'EXPERIENCE' || sectionType === 'PROJECT';
      })
      .filter((unit) => trimToText(unit?.text).length > 0)
      .slice(0, 4);

    if (evidenceUnits.length < 2) {
      throw new Error('canonical_cover_letter_evidence_insufficient');
    }

    const groupedEvidence = groupEvidenceBySourceBlock(evidenceUnits);
    const selectedEvidence =
      groupedEvidence.length >= 2
        ? [groupedEvidence[0][0], groupedEvidence[1][0]].filter(Boolean)
        : evidenceUnits.slice(0, 2);

    if (selectedEvidence.length < 2) {
      throw new Error('canonical_cover_letter_evidence_insufficient');
    }

    const openingEvidence = [selectedEvidence[0]];
    const bodyOneEvidence = [selectedEvidence[0]];
    const bodyTwoEvidence = [selectedEvidence[1]];
    const closingEvidence = [selectedEvidence[0]];

    const opening = buildOpeningParagraph({
      jobTitle: input.jobTitle,
      jobCompany: input.jobCompany,
      leadEvidence: selectedEvidence[0],
    });
    const bodyParagraphs = [
      buildBodyParagraph({
        jobTitle: input.jobTitle,
        jobCompany: input.jobCompany,
        primaryEvidence: selectedEvidence[0],
        paragraphIndex: 1,
      }),
      buildBodyParagraph({
        jobTitle: input.jobTitle,
        jobCompany: input.jobCompany,
        primaryEvidence: selectedEvidence[1],
        paragraphIndex: 2,
      }),
    ];
    const closing = buildClosingParagraph({
      jobTitle: input.jobTitle,
      jobCompany: input.jobCompany,
      evidence: closingEvidence,
    });

    const paragraphEvidence: CanonicalCoverLetterParagraphEvidence[] = [
      buildParagraphEvidence({ paragraphKey: 'opening', evidenceUnits: openingEvidence }),
      buildParagraphEvidence({ paragraphKey: 'body_1', evidenceUnits: bodyOneEvidence }),
      buildParagraphEvidence({ paragraphKey: 'body_2', evidenceUnits: bodyTwoEvidence }),
      buildParagraphEvidence({ paragraphKey: 'closing', evidenceUnits: closingEvidence }),
    ];

    const fullText = [opening, ...bodyParagraphs, closing].filter(Boolean).join('\n\n');
    const flags = this.detector.detect(fullText);

    return {
      opening,
      bodyParagraphs,
      closing,
      paragraphEvidence,
      diagnostics: {
        genericLanguageFlags: flags,
        renderedEvidenceSnippetIds: selectedEvidence.map((unit) => unit.id),
        narrativeStrategy: 'canonical_cover_letter_v1',
      },
    };
  }
}
