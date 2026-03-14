import type {
  AllowedBaselineBlock,
  CoverLetterGenerationInput,
  CoverLetterGenerationResult,
  CoverLetterGenerator,
  CoverLetterJobContext,
} from './cover-letter-generator.interface';
import type { CoverLetterComplianceConstraints } from '../types/cover-letter-compliance-constraints';
import type { NormalizedCoverLetterDocument } from '../../documents/normalized-document.models';

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

const PAGE_MARKER_PATTERN = /^(?:page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|\d+\s*[\/|]\s*\d+|p\.?\s*\d+)$/i;

export class TemplateCoverLetterGenerator implements CoverLetterGenerator {
  private readonly hardCap = 340;

  generate(input: CoverLetterGenerationInput): CoverLetterGenerationResult {
    const targetWords = this.resolveTargetWords(input.maxWords);
    const normalizedJob = this.applyComplianceConstraintsToJob(
      this.normalizeJob(input.job),
      input.complianceConstraints,
    );
    const baselineBlocks = this.normalizeBlocks(input.allowedBaselineBlocks);
    const verifiedEvidence = this.selectEvidenceSnippets(
      baselineBlocks,
      normalizedJob,
      input.complianceConstraints,
    );

    const opening = this.ensureSentence(
      `I am applying for ${this.describeRole(normalizedJob)} and I can contribute immediately with verified operational experience.`,
    );

    const priorities = this.selectPriorities(normalizedJob);
    const bodyParagraphs = [
      this.ensureSentence(
        priorities.length
          ? `Your team is prioritizing ${this.formatList(priorities)}. My background aligns with those priorities through documented execution and clear ownership.`
          : 'Your team is prioritizing reliable execution, measurable service outcomes, and strong cross functional collaboration. My background aligns with those priorities through documented execution and clear ownership.',
      ),
      this.composeEvidenceParagraph(verifiedEvidence),
    ].filter(Boolean);

    const closingParagraph = this.ensureSentence(
      normalizedJob.company
        ? `I would welcome the chance to discuss how this experience can support ${normalizedJob.company}.`
        : 'I would welcome the chance to discuss how this experience can support your team.',
    );

    const signatureName = '';
    const letterDocument: NormalizedCoverLetterDocument = {
      senderHeading: {
        name: '',
      },
      salutation: 'Dear Hiring Team,',
      opening,
      bodyParagraphs,
      closingParagraph,
      signoff: 'Sincerely,',
      signatureName,
    };

    let content = this.composeTextContent(letterDocument);
    content = this.removeDisallowedPhrases(content, input.complianceConstraints);
    content = this.trimToWordLimit(content, targetWords);

    const parsed = this.parseContentToDocument(content, letterDocument);

    return {
      document: parsed,
      content,
      wordCount: this.countWords(content),
      greeting: parsed.salutation,
      paragraphs: [parsed.opening, ...parsed.bodyParagraphs],
      closingParagraphs: [`${parsed.closingParagraph} ${parsed.signoff}`.trim()],
      constraintSummary: this.buildConstraintSummary(input.complianceConstraints),
    };
  }

  private resolveTargetWords(maxWords?: number | null) {
    if (!maxWords || Number.isNaN(maxWords) || maxWords <= 0) {
      return 320;
    }
    return Math.min(Math.max(Math.floor(maxWords), 220), this.hardCap);
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

  private cleanText(value?: string | null) {
    return (value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u2013\u2014]/g, ',')
      .replace(/\s+/g, ' ')
      .trim();
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

  private selectEvidenceSnippets(
    blocks: NormalizedBlock[],
    job: NormalizedJob,
    constraints?: CoverLetterComplianceConstraints,
  ): string[] {
    const jobSignals = new Set(this.tokenize([job.title, ...job.requirements, ...job.responsibilities].filter(Boolean).join(' ')));
    const scored: Array<{ text: string; score: number; idx: number }> = [];

    blocks.forEach((block, blockIndex) => {
      const sentences = block.content
        .split(/(?<=[.!?])\s+|\n+/)
        .map((line) => this.cleanText(line))
        .filter((line) => line.length >= 25 && line.length <= 180)
        .filter((line) => !PAGE_MARKER_PATTERN.test(line))
        .filter((line) => !this.looksLikeRawPayload(line))
        .filter((line) => !this.shouldSkipStatement(line, constraints));

      sentences.forEach((sentence, sentenceIndex) => {
        const capped = this.limitWords(sentence, 20);
        const overlap = this.tokenize(capped).filter((token) => jobSignals.has(token)).length;
        const score = overlap * 2 + Math.min(capped.length / 60, 2);
        scored.push({ text: this.ensureSentence(capped), score, idx: blockIndex * 100 + sentenceIndex });
      });
    });

    return scored
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx))
      .map((entry) => entry.text)
      .filter((text, index, list) => list.findIndex((candidate) => candidate.toLowerCase() === text.toLowerCase()) === index)
      .slice(0, 3);
  }

  private composeEvidenceParagraph(snippets: string[]): string {
    if (!snippets.length) {
      return 'Verified experience includes operational leadership, stakeholder communication, and measurable service improvement across recurring support workflows.';
    }
    if (snippets.length === 1) {
      return this.ensureSentence(`Verified experience includes ${this.stripTrailingPeriod(snippets[0]).toLowerCase()}.`);
    }

    const [first, ...rest] = snippets;
    return this.ensureSentence(
      `Verified experience includes ${this.stripTrailingPeriod(first).toLowerCase()}. ${rest.join(' ')}`,
    );
  }

  private selectPriorities(job: NormalizedJob) {
    const combined = [...job.responsibilities, ...job.requirements]
      .map((item) => this.cleanText(item))
      .filter(Boolean)
      .map((item) => this.limitWords(item, 10));
    return combined
      .filter((item, index) => combined.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === index)
      .slice(0, 3);
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

  private composeTextContent(document: NormalizedCoverLetterDocument): string {
    return [
      document.salutation,
      document.opening,
      ...document.bodyParagraphs,
      document.closingParagraph,
      document.signoff,
      document.signatureName,
    ]
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

    const salutation = /^dear\b/i.test(paragraphs[0] ?? '') ? paragraphs.shift()! : seed.salutation;
    const signoffCandidate = paragraphs[paragraphs.length - 1] ?? '';
    const signoff = /^sincerely[,]?$/i.test(signoffCandidate) ? paragraphs.pop()! : seed.signoff;
    const opening = paragraphs.shift() ?? seed.opening;
    const closingParagraph = paragraphs.pop() ?? seed.closingParagraph;

    return {
      ...seed,
      salutation,
      opening,
      bodyParagraphs: paragraphs,
      closingParagraph,
      signoff,
    };
  }

  private removeDisallowedPhrases(
    content: string,
    constraints?: CoverLetterComplianceConstraints,
  ) {
    if (!constraints || constraints.mode !== 'strict') {
      return content;
    }

    const phrases = [
      ...(constraints.disallowPhrases ?? []),
      ...(constraints.disallowRoleTitles ?? []),
    ];

    let sanitized = content;
    for (const phrase of phrases) {
      const trimmed = phrase.trim();
      if (!trimmed) continue;
      sanitized = sanitized.replace(new RegExp(`\\b${this.escapeRegExp(trimmed)}\\b`, 'gi'), '');
    }
    return sanitized
      .replace(/[\u2013\u2014]/g, ',')
      .replace(/\s+-\s+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
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

  private looksLikeRawPayload(value: string): boolean {
    const lowered = value.toLowerCase();
    return lowered.includes('{"') || lowered.includes('audit_id') || lowered.includes('compliance_flags');
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

  private limitWords(text: string, limit: number) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= limit) {
      return this.cleanText(text);
    }

    return this.cleanText(words.slice(0, limit).join(' '));
  }

  private trimToWordLimit(text: string, limit: number) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= limit) {
      return text.trim();
    }

    const trimmed = words.slice(0, limit).join(' ').trim();
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  }

  private countWords(text: string) {
    return text.split(/\s+/).filter(Boolean).length;
  }

  private formatList(items: string[]) {
    const cleaned = items.map((item) => this.cleanText(item)).filter(Boolean);

    if (cleaned.length === 0) {
      return '';
    }

    if (cleaned.length === 1) {
      return cleaned[0];
    }

    if (cleaned.length === 2) {
      return `${cleaned[0]} and ${cleaned[1]}`;
    }

    const last = cleaned[cleaned.length - 1];
    return `${cleaned.slice(0, -1).join(', ')}, and ${last}`;
  }

  private tokenize(text: string) {
    return text
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length >= 3) ?? [];
  }

  private stripTrailingPeriod(text: string) {
    return text.replace(/[.]+$/, '').trim();
  }

  private ensureSentence(text: string) {
    const sanitized = this.cleanText(text)
      .replace(/\s+-\s+/g, ' ')
      .replace(/[\u2013\u2014]/g, ',')
      .trim();
    if (!sanitized) return '';
    return /[.!?]$/.test(sanitized) ? sanitized : `${sanitized}.`;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    return disallowList.some((value) => value && normalized.includes(value.toLowerCase()));
  }
}
