import type {
  AllowedBaselineBlock,
  CoverLetterGenerationInput,
  CoverLetterGenerationResult,
  CoverLetterGenerator,
  CoverLetterJobContext,
} from './cover-letter-generator.interface';
import type { CoverLetterComplianceConstraints } from '../types/cover-letter-compliance-constraints';
import type { NormalizedCoverLetterDocument } from '../../documents/normalized-document.models';
import {
  COVER_LETTER_MAX_BODY_PARAGRAPHS,
  COVER_LETTER_BULLET_PATTERN,
  COVER_LETTER_FORBIDDEN_PHRASES,
  COVER_LETTER_PHRASE_REWRITES,
  COVER_LETTER_REQUIRED_SALUTATION,
  COVER_LETTER_RESUME_ARTIFACT_PATTERNS,
  COVER_LETTER_SIGNOFF,
  COVER_LETTER_WORD_LIMITS,
} from './cover-letter-writing-contract';
import {
  extractEvidenceUnitsFromLogicalUnits,
  reconstructLogicalTextUnits,
  type ResumeEvidenceUnit,
} from '../../resume/resume-draft-bullets';

type NormalizedJob = CoverLetterJobContext & {
  title: string | null;
  company: string | null;
  responsibilities: string[];
  requirements: string[];
};

type NormalizedBlock = AllowedBaselineBlock & {
  content: string;
  title: string | null;
};

type ScoredEvidence = {
  evidence: ResumeEvidenceUnit;
  score: number;
  stableIndex: number;
};

const PAGE_MARKER_PATTERN =
  /^(?:page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|\d+\s*[/|]\s*\d+|p\.?\s*\d+)$/i;

export class TemplateCoverLetterGenerator implements CoverLetterGenerator {
  generate(input: CoverLetterGenerationInput): CoverLetterGenerationResult {
    const targetWords = this.resolveTargetWords(input.maxWords);
    const normalizedJob = this.applyComplianceConstraintsToJob(
      this.normalizeJob(input.job),
      input.complianceConstraints,
    );
    const baselineBlocks = this.normalizeBlocks(input.allowedBaselineBlocks);
    const candidateName = this.cleanText(input.candidateName) || 'Candidate';

    const allEvidence = this.collectEvidenceUnits(
      baselineBlocks,
      input.complianceConstraints,
    );
    const selectedEvidence = this.selectEvidenceUnits(
      allEvidence,
      normalizedJob,
      input.safeMode === true,
    );

    const roleDescriptor = this.describeRole(normalizedJob);
    const openingEvidence = selectedEvidence[0] ? [selectedEvidence[0]] : [];
    const remainingEvidence = selectedEvidence.slice(openingEvidence.length);

    const bodyOneEvidenceSeed = remainingEvidence.slice(0, 3);
    const bodyOneEvidence =
      bodyOneEvidenceSeed.length > 0
        ? bodyOneEvidenceSeed
        : openingEvidence.length > 0
          ? openingEvidence
          : [];
    const bodyTwoEvidenceSeed = remainingEvidence.slice(3, 7);
    const bodyTwoEvidence =
      bodyTwoEvidenceSeed.length > 0
        ? bodyTwoEvidenceSeed
        : bodyOneEvidence.length > 0
          ? [bodyOneEvidence[0]]
          : openingEvidence.length > 0
            ? openingEvidence
            : [];
    const closingEvidence =
      remainingEvidence[7] ?? bodyTwoEvidence[bodyTwoEvidence.length - 1] ?? selectedEvidence[0] ?? null;

    const opening = this.joinSentences([
      this.ensureSentence(`I am applying for ${roleDescriptor}`),
      ...openingEvidence.map((entry) => this.ensureSentence(entry.normalizedText)),
    ]);

    const fallbackBodyOne =
      normalizedJob.requirements[0] ??
      normalizedJob.responsibilities[0] ??
      'I align execution with role priorities and measurable outcomes.';
    const fallbackBodyTwo =
      normalizedJob.responsibilities[1] ??
      normalizedJob.requirements[1] ??
      'I lead operational delivery with clear ownership, communication, and follow-through.';
    const bodyParagraphs = [
      this.joinSentences(
        bodyOneEvidence.length
          ? bodyOneEvidence.map((entry) => this.ensureSentence(entry.normalizedText))
          : [this.ensureSentence(fallbackBodyOne)],
      ),
      this.joinSentences(
        bodyTwoEvidence.length
          ? bodyTwoEvidence.map((entry) => this.ensureSentence(entry.normalizedText))
          : [this.ensureSentence(fallbackBodyTwo)],
      ),
    ];

    const closing = this.joinSentences(
      [
        this.ensureSentence(
          normalizedJob.company
            ? `I am interested in bringing this experience to ${normalizedJob.company} and would value a conversation about the role`
            : 'I am interested in bringing this experience to your team and would value a conversation about the role',
        ),
        closingEvidence ? this.ensureSentence(closingEvidence.normalizedText) : '',
      ].filter(Boolean),
    );

    const document: NormalizedCoverLetterDocument = {
      senderHeading: {
        name: candidateName,
      },
      salutation: COVER_LETTER_REQUIRED_SALUTATION,
      opening,
      bodyParagraphs,
      closingParagraph: closing,
      signoff: COVER_LETTER_SIGNOFF,
      signatureName: candidateName,
    };

    const paragraphEvidence: CoverLetterGenerationResult['paragraphEvidence'] = [
      {
        paragraphKey: 'opening',
        sourceEvidenceIds: openingEvidence.map((entry) => entry.id),
        anchorTexts: openingEvidence.map((entry) => entry.sourceText),
      },
      ...bodyParagraphs.map((paragraph, index) => {
        void paragraph;
        const source = [bodyOneEvidence, bodyTwoEvidence][index] ?? [];
        return {
          paragraphKey: (`body_${index + 1}` as 'body_1' | 'body_2' | 'body_3'),
          sourceEvidenceIds: source.map((entry) => entry.id),
          anchorTexts: source.map((entry) => entry.sourceText),
        };
      }),
      {
        paragraphKey: 'closing',
        sourceEvidenceIds: closingEvidence ? [closingEvidence.id] : [],
        anchorTexts: closingEvidence ? [closingEvidence.sourceText] : [],
      },
    ];

    let content = this.composeTextContent(document);
    content = this.removeDisallowedPhrases(content, input.complianceConstraints);
    content = this.normalizeWritingStyle(content);
    content = this.ensureMinimumWordCount(content, document, targetWords);
    content = this.trimToWordLimit(content, targetWords);

    // Keep evidence anchored paragraphs immutable after sanitization.
    const parsed = this.parseContentToDocument(content, document);
    const parsedContent = this.composeTextContent(parsed);

    return {
      document: parsed,
      content: parsedContent,
      wordCount: this.countWords(parsedContent),
      greeting: parsed.salutation,
      paragraphs: [parsed.opening, ...parsed.bodyParagraphs],
      closingParagraphs: [parsed.closingParagraph],
      constraintSummary: this.buildConstraintSummary(input.complianceConstraints),
      paragraphEvidence,
    };
  }

  private resolveTargetWords(maxWords?: number | null) {
    if (!maxWords || Number.isNaN(maxWords) || maxWords <= 0) {
      return COVER_LETTER_WORD_LIMITS.preferredTarget;
    }
    return Math.min(
      Math.max(Math.floor(maxWords), COVER_LETTER_WORD_LIMITS.minimum),
      COVER_LETTER_WORD_LIMITS.maximum,
    );
  }

  private normalizeJob(job: CoverLetterJobContext): NormalizedJob {
    const sanitizeList = (items?: string[]) =>
      (items ?? [])
        .map((item) => this.cleanText(item))
        .filter((item): item is string => Boolean(item));

    return {
      ...job,
      title: this.cleanText(job.title),
      company: this.cleanText(job.company),
      responsibilities: sanitizeList(job.responsibilities),
      requirements: sanitizeList(job.requirements),
    };
  }

  private normalizeBlocks(blocks: AllowedBaselineBlock[]): NormalizedBlock[] {
    return blocks
      .map((block, index) => ({
        ...block,
        title: this.cleanText(block.title),
        content: this.cleanText(block.content),
        order: block.order ?? index,
      }))
      .filter((block) => block.content.length > 0)
      .sort((a, b) => a.order - b.order);
  }

  private collectEvidenceUnits(
    blocks: NormalizedBlock[],
    constraints?: CoverLetterComplianceConstraints,
  ): ResumeEvidenceUnit[] {
    const evidence: ResumeEvidenceUnit[] = [];

    for (const block of blocks) {
      const logicalUnits = reconstructLogicalTextUnits(block.content);
      if (!logicalUnits.length) continue;
      const extracted = extractEvidenceUnitsFromLogicalUnits(block.id, logicalUnits)
        .filter((entry) => !this.shouldSkipStatement(entry.normalizedText, constraints))
        .filter((entry) => entry.normalizedText.length >= 35)
        .filter((entry) => !PAGE_MARKER_PATTERN.test(entry.normalizedText))
        .filter((entry) => !this.looksLikeRawPayload(entry.normalizedText));
      evidence.push(...extracted);
    }

    return evidence;
  }

  private selectEvidenceUnits(
    evidence: ResumeEvidenceUnit[],
    job: NormalizedJob,
    safeMode: boolean,
  ): ResumeEvidenceUnit[] {
    const jobSignals = new Set(
      this.tokenize(
        [job.title, ...job.requirements, ...job.responsibilities]
          .filter(Boolean)
          .join(' '),
      ),
    );

    const scored: ScoredEvidence[] = evidence.map((entry, index) => {
      const tokens = this.tokenize(entry.normalizedText);
      const overlap = tokens.filter((token) => jobSignals.has(token)).length;
      const score = overlap * (safeMode ? 1 : 2) + Math.min(tokens.length / 14, 2);
      return {
        evidence: entry,
        score,
        stableIndex: index,
      };
    });

    return scored
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.stableIndex - b.stableIndex))
      .map((item) => item.evidence)
      .filter(
        (entry, index, list) =>
          list.findIndex(
            (candidate) =>
              candidate.normalizedText.toLowerCase() === entry.normalizedText.toLowerCase(),
          ) === index,
      )
      .slice(0, safeMode ? 8 : 12);
  }

  private applyComplianceConstraintsToJob(
    job: NormalizedJob,
    constraints?: CoverLetterComplianceConstraints,
  ): NormalizedJob {
    if (!constraints || constraints.mode !== 'strict') {
      return job;
    }

    const allowedCompanies = this.normalizeConstraintSet(
      constraints.allowedCompanyNames,
    );
    const allowedRoles = this.normalizeConstraintSet(
      constraints.allowedRoleTitles,
    );

    const sanitized: NormalizedJob = { ...job };

    if (allowedCompanies.size > 0 && !this.isAllowedValue(job.company, allowedCompanies)) {
      sanitized.company = null;
    }
    if (allowedRoles.size > 0 && !this.isAllowedValue(job.title, allowedRoles)) {
      sanitized.title = null;
    }

    return sanitized;
  }

  private composeTextContent(document: NormalizedCoverLetterDocument): string {
    return [
      COVER_LETTER_REQUIRED_SALUTATION,
      document.opening,
      ...document.bodyParagraphs.slice(0, COVER_LETTER_MAX_BODY_PARAGRAPHS),
      document.closingParagraph,
      COVER_LETTER_SIGNOFF,
      document.signatureName,
    ]
      .map((line) => this.cleanText(line))
      .filter(Boolean)
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private parseContentToDocument(
    content: string,
    seed: NormalizedCoverLetterDocument,
  ): NormalizedCoverLetterDocument {
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((part) => this.cleanText(part))
      .filter(Boolean);

    while ((paragraphs[0] ?? '').toLowerCase() === COVER_LETTER_REQUIRED_SALUTATION.toLowerCase()) {
      paragraphs.shift();
    }

    let signatureName = seed.signatureName;
    for (let idx = paragraphs.length - 1; idx >= 0; idx -= 1) {
      if ((paragraphs[idx] ?? '').toLowerCase() !== COVER_LETTER_SIGNOFF.toLowerCase()) continue;
      if (paragraphs[idx + 1]) {
        signatureName = paragraphs[idx + 1];
      }
      paragraphs.splice(idx);
    }

    const opening = paragraphs.shift() ?? seed.opening;
    const closingParagraph = paragraphs.pop() ?? seed.closingParagraph;
    const bodyParagraphs = paragraphs.slice(0, COVER_LETTER_MAX_BODY_PARAGRAPHS);
    while (bodyParagraphs.length < COVER_LETTER_MAX_BODY_PARAGRAPHS) {
      bodyParagraphs.push(
        this.ensureSentence(
          bodyParagraphs.length === 0
            ? 'I align execution with role priorities and measurable outcomes'
            : 'I lead operational delivery with clear ownership and cross-functional coordination',
        ),
      );
    }

    return {
      ...seed,
      salutation: COVER_LETTER_REQUIRED_SALUTATION,
      opening,
      bodyParagraphs,
      closingParagraph,
      signoff: COVER_LETTER_SIGNOFF,
      signatureName,
    };
  }

  private removeDisallowedPhrases(
    content: string,
    constraints?: CoverLetterComplianceConstraints,
  ) {
    const phrases = [
      ...COVER_LETTER_FORBIDDEN_PHRASES,
      ...(constraints?.mode === 'strict' ? constraints.disallowPhrases ?? [] : []),
      ...(constraints?.mode === 'strict' ? constraints.disallowRoleTitles ?? [] : []),
    ];

    let sanitized = content;
    for (const rewrite of COVER_LETTER_PHRASE_REWRITES) {
      sanitized = sanitized.replace(rewrite.pattern, rewrite.replacement);
    }
    for (const phrase of phrases) {
      const trimmed = phrase.trim();
      if (!trimmed) continue;
      sanitized = sanitized.replace(
        new RegExp(`\\b${this.escapeRegExp(trimmed)}\\b`, 'gi'),
        '',
      );
    }

    return sanitized
      .replace(/\s{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private normalizeWritingStyle(content: string) {
    const sanitizedBlocks = content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        let current = block;
        for (const pattern of COVER_LETTER_RESUME_ARTIFACT_PATTERNS) {
          current = current.replace(pattern, ' ');
        }
        return current
          .split('\n')
          .map((line) => line.replace(COVER_LETTER_BULLET_PATTERN, '').trim())
          .filter(Boolean)
          .join(' ');
      });

    return sanitizedBlocks
      .join('\n\n')
      .replace(/[\u2013\u2014-]/g, ' ')
      .replace(/\s*[,;:]\s*[,;:]+/g, ', ')
      .replace(/,{2,}/g, ',')
      .replace(/\s{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private describeRole(job: NormalizedJob) {
    if (job.title && job.company) {
      return `the ${job.title} role at ${job.company}`;
    }
    if (job.title) {
      return `the ${job.title} role`;
    }
    if (job.company) {
      return `an opening at ${job.company}`;
    }
    return 'this role';
  }

  private shouldSkipStatement(
    statement: string,
    constraints?: CoverLetterComplianceConstraints,
  ) {
    if (!constraints || constraints.mode !== 'strict') {
      return false;
    }

    return (
      this.containsDisallowedValue(statement, constraints.disallowPhrases) ||
      this.containsDisallowedValue(statement, constraints.disallowRoleTitles)
    );
  }

  private joinSentences(sentences: string[]): string {
    return sentences
      .map((sentence) => this.ensureSentence(sentence))
      .filter(Boolean)
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private trimToWordLimit(text: string, limit: number) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= limit) {
      return text.trim();
    }

    const trimmed = words.slice(0, limit).join(' ').trim();
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  }

  private ensureMinimumWordCount(
    content: string,
    document: NormalizedCoverLetterDocument,
    targetWords: number,
  ): string {
    if (this.countWords(content) >= COVER_LETTER_WORD_LIMITS.minimum) {
      return content;
    }

    const additions = [
      'I value clear priorities, reliable execution, and practical collaboration across teams.',
      'I work best in environments where goals are explicit and accountability is shared.',
      'I focus on consistent delivery quality and transparent communication throughout execution.',
      'I would welcome the opportunity to discuss where this background can support your team.',
    ];

    const body = [...document.bodyParagraphs];
    if (!body[0]) body[0] = '';
    if (!body[1]) body[1] = '';

    let expanded = content;
    const appendPlan = [
      () => {
        body[0] = this.joinSentences([body[0], additions[0]]);
      },
      () => {
        body[1] = this.joinSentences([body[1], additions[1]]);
      },
      () => {
        document.opening = this.joinSentences([document.opening, additions[2]]);
      },
      () => {
        document.closingParagraph = this.joinSentences([
          document.closingParagraph,
          additions[3],
        ]);
      },
      () => {
        body[0] = this.joinSentences([body[0], additions[2]]);
      },
      () => {
        body[1] = this.joinSentences([body[1], additions[0]]);
      },
    ];

    for (const apply of appendPlan) {
      if (this.countWords(expanded) >= COVER_LETTER_WORD_LIMITS.minimum) {
        break;
      }
      apply();
      expanded = [
        COVER_LETTER_REQUIRED_SALUTATION,
        document.opening,
        ...body.slice(0, 3),
        document.closingParagraph,
        COVER_LETTER_SIGNOFF,
        document.signatureName,
      ]
        .filter(Boolean)
        .join('\n\n');
    }

    while (this.countWords(expanded) < COVER_LETTER_WORD_LIMITS.minimum) {
      document.closingParagraph = this.joinSentences([
        document.closingParagraph,
        'Thank you for considering my application.',
      ]);
      expanded = [
        COVER_LETTER_REQUIRED_SALUTATION,
        document.opening,
        ...body.slice(0, 3),
        document.closingParagraph,
        COVER_LETTER_SIGNOFF,
        document.signatureName,
      ]
        .filter(Boolean)
        .join('\n\n');
    }

    return this.trimToWordLimit(expanded, targetWords);
  }

  private countWords(text: string) {
    return text.split(/\s+/).filter(Boolean).length;
  }

  private tokenize(text: string) {
    return (
      text
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter((token) => token.length >= 3) ?? []
    );
  }

  private ensureSentence(text: string) {
    const sanitized = this.cleanText(text).trim();
    if (!sanitized) return '';
    return /[.!?]$/.test(sanitized) ? sanitized : `${sanitized}.`;
  }

  private cleanText(value?: string | null) {
    return (value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildConstraintSummary(
    constraints?: CoverLetterComplianceConstraints,
  ): string | null {
    if (!constraints || constraints.mode !== 'strict') {
      return null;
    }

    const segments: string[] = [];
    if (constraints.allowedCompanyNames?.length) {
      segments.push(`Allowed companies: ${constraints.allowedCompanyNames.join(', ')}.`);
    }
    if (constraints.allowedRoleTitles?.length) {
      segments.push(`Allowed titles: ${constraints.allowedRoleTitles.join(', ')}.`);
    }
    if (constraints.disallowPhrases?.length) {
      segments.push(`Avoid phrases such as ${constraints.disallowPhrases.join(', ')}.`);
    }
    if (constraints.disallowRoleTitles?.length) {
      segments.push(`Avoid titles such as ${constraints.disallowRoleTitles.join(', ')}.`);
    }

    return segments.length ? segments.join(' ') : null;
  }

  private normalizeConstraintSet(values?: string[] | null): Set<string> {
    const set = new Set<string>();
    if (!values) {
      return set;
    }
    for (const raw of values) {
      const cleaned = this.cleanText(raw);
      if (!cleaned) continue;
      set.add(cleaned.toLowerCase());
    }
    return set;
  }

  private isAllowedValue(value: string | null, allowedSet: Set<string>) {
    if (!value) {
      return false;
    }
    return allowedSet.has(value.toLowerCase());
  }

  private containsDisallowedValue(statement: string, disallowList?: string[]) {
    if (!disallowList || disallowList.length === 0) {
      return false;
    }
    const normalized = statement.toLowerCase();
    return disallowList.some(
      (value) => value && normalized.includes(value.toLowerCase()),
    );
  }

  private looksLikeRawPayload(value: string): boolean {
    const lowered = value.toLowerCase();
    return (
      lowered.includes('{"') ||
      lowered.includes('audit_id') ||
      lowered.includes('compliance_flags')
    );
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
