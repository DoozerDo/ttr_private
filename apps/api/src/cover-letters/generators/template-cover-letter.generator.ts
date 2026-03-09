import type {
  AllowedBaselineBlock,
  CoverLetterGenerationInput,
  CoverLetterGenerationResult,
  CoverLetterGenerator,
  CoverLetterJobContext,
} from './cover-letter-generator.interface';
import type { CoverLetterComplianceConstraints } from '../types/cover-letter-compliance-constraints';

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

export class TemplateCoverLetterGenerator implements CoverLetterGenerator {
  // Enforce a one-page limit: cap output to ~350 words to stay within a standard printed page.
  private readonly hardCap = 350;
  private readonly minWords = 230;

  generate(input: CoverLetterGenerationInput): CoverLetterGenerationResult {
    const targetWords = this.resolveTargetWords(input.maxWords);
    const normalizedJob = this.normalizeJob(input.job);
    const constraints = input.complianceConstraints;
    const constrainedJob = this.applyComplianceConstraintsToJob(
      normalizedJob,
      constraints,
    );
    const baselineBlocks = this.normalizeBlocks(input.allowedBaselineBlocks);
    const baselineStatements = this.extractBaselineStatements(
      baselineBlocks,
      constraints,
    );
    const jobSignals = this.buildJobSignals(constrainedJob);
    const selectedEvidence = this.selectEvidenceStatements(
      baselineStatements,
      jobSignals,
    );
    const selectedPriorities = this.selectPriorities(constrainedJob);
    const strategicStrengths = this.cleanList(input.gapAnalysis?.strengths ?? []).slice(0, 2);

    const paragraphs = [
      this.composeOpening(constrainedJob, selectedEvidence[0]),
      this.composeAlignment(
        constrainedJob,
        selectedPriorities,
        strategicStrengths,
        selectedEvidence[1] ?? selectedEvidence[0],
      ),
      this.composeEvidence(selectedEvidence),
      this.composeClosing(
        constrainedJob,
        input.closingTemplate.text,
      ),
    ];

    const greeting = 'Dear Hiring Team,';
    const trimmedParagraphs = paragraphs
      .map((paragraph) => this.sanitizeSentence(paragraph))
      .filter(Boolean);
    const closingParagraph = trimmedParagraphs.pop() ?? '';
    const bodyParagraphs = [...trimmedParagraphs];

    let content = [greeting, ...bodyParagraphs, closingParagraph]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    content = this.removeDisallowedPhrases(content, constraints);

    let wordCount = this.countWords(content);

    if (wordCount > targetWords) {
      content = this.trimToWordLimit(content, targetWords);
      wordCount = this.countWords(content);
    } else if (wordCount < this.minWords) {
      content = this.expandWithAdditionalEvidence(
        content,
        selectedEvidence,
        this.minWords,
      );
      wordCount = this.countWords(content);
    }

    const finalParagraphs = this.splitParagraphs(content);
    let finalGreeting = greeting;
    if (finalParagraphs.length && /^dear\b/i.test(finalParagraphs[0])) {
      finalGreeting = finalParagraphs.shift()!;
    }
    const finalClosing =
      finalParagraphs.length > 0 ? finalParagraphs.pop() : undefined;

    return {
      content,
      wordCount,
      greeting: finalGreeting,
      paragraphs: finalParagraphs,
      closingParagraphs: finalClosing ? [finalClosing] : [],
      constraintSummary: this.buildConstraintSummary(constraints),
    };
  }

  private resolveTargetWords(maxWords?: number | null) {
    if (!maxWords || Number.isNaN(maxWords) || maxWords <= 0) {
      return 320;
    }

    const clamped = Math.min(Math.max(Math.floor(maxWords), this.minWords), this.hardCap);
    return clamped;
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
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractBaselineStatements(
    blocks: NormalizedBlock[],
    constraints?: CoverLetterComplianceConstraints,
  ) {
    const statements: string[] = [];

    blocks.forEach((block) => {
      const sentences = block.content
        .split(/(?<=[.!?])\s+|\n+/)
        .map((sentence) => this.cleanText(sentence))
        .filter(Boolean);

      sentences.forEach((sentence) => {
        const limited = this.limitWords(sentence, 60);
        if (limited.length === 0) {
          return;
        }
        if (this.shouldSkipStatement(limited, constraints)) {
          return;
        }
        statements.push(limited);
      });
    });

    return statements.slice(0, 24);
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

  private buildJobSignals(job: NormalizedJob) {
    const weighted = new Map<string, number>();
    const addText = (text: string, baseWeight: number) => {
      const tokens = this.tokenize(text);
      tokens.forEach((token) => {
        weighted.set(token, (weighted.get(token) ?? 0) + baseWeight);
      });
    };

    addText(job.title ?? '', 1.8);
    addText(job.company ?? '', 0.3);
    job.responsibilities.forEach((item) => addText(item, 1.4));
    job.requirements.forEach((item) => addText(item, 1.2));

    return new Set(
      [...weighted.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 36)
        .map(([token]) => token),
    );
  }

  private selectEvidenceStatements(statements: string[], jobSignals: Set<string>) {
    if (!statements.length) {
      return [];
    }

    const scored = statements.map((statement, index) => {
      const tokens = new Set(this.tokenize(statement));
      let overlap = 0;
      for (const token of tokens) {
        if (jobSignals.has(token)) overlap += 1;
      }
      const score = overlap * 3 + Math.min(tokens.size, 24) * 0.1;
      return { statement, index, score };
    });

    return scored
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.index - b.index;
      })
      .slice(0, 5)
      .map((entry) => this.ensureSentence(entry.statement));
  }

  private selectPriorities(job: NormalizedJob) {
    const combined = this.cleanList([
      ...job.responsibilities,
      ...job.requirements,
    ]);
    const deduped = Array.from(
      new Set(combined.map((item) => item.toLowerCase())),
    ).map((key) => combined.find((item) => item.toLowerCase() === key)!);
    return deduped.map((item) => this.limitWords(item, 14)).slice(0, 3);
  }

  private composeOpening(job: NormalizedJob, leadEvidence?: string) {
    const roleDescriptor = this.describeRole(job);
    const evidenceLine = leadEvidence
      ? `My background includes ${this.stripTrailingPeriod(leadEvidence).toLowerCase()}.`
      : 'My background includes verified operational and customer support experience relevant to this role.';

    return `I am writing to apply for ${roleDescriptor}. ${evidenceLine}`;
  }

  private composeAlignment(
    job: NormalizedJob,
    priorities: string[],
    strategicStrengths: string[],
    supportingEvidence?: string,
  ) {
    const priorityLine = priorities.length
      ? `The role emphasizes ${this.formatList(priorities)}.`
      : 'The role emphasizes operational execution, customer outcomes, and cross functional partnership.';
    const strengthsLine = strategicStrengths.length
      ? `My strongest alignment areas include ${this.formatList(strategicStrengths)}.`
      : '';
    const evidenceLine = supportingEvidence
      ? `Relevant verified experience includes ${this.stripTrailingPeriod(supportingEvidence).toLowerCase()}.`
      : '';

    return `${priorityLine} ${strengthsLine} ${evidenceLine}`;
  }

  private composeEvidence(statements: string[]) {
    const examples = statements.slice(0, 3);
    if (!examples.length) {
      return 'I can discuss additional verified examples from my background that align with the responsibilities and requirements in this posting.';
    }

    const lines = examples.map((statement) =>
      this.ensureSentence(statement),
    );
    return `Examples from my verified background include ${this.stripTrailingPeriod(lines[0]).toLowerCase()}. ${lines
      .slice(1)
      .join(' ')}`;
  }

  private composeClosing(
    job: NormalizedJob,
    closingTemplate: string,
  ) {
    const roleDescriptor = this.describeRole(job);
    const companyLine = job.company
      ? `I appreciate your consideration and would welcome the opportunity to discuss how my experience can support ${job.company}.`
      : 'I appreciate your consideration and would welcome the opportunity to discuss this role further.';
    const normalizedClosingTemplate = this.sanitizeSentence(closingTemplate);

    return `${normalizedClosingTemplate} Thank you for reviewing my application for ${roleDescriptor}. ${companyLine} Sincerely,`;
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

    return 'the role you described';
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
    return trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
  }

  private expandWithAdditionalEvidence(
    content: string,
    statements: string[],
    minWords: number,
  ) {
    const paragraphs = this.splitParagraphs(content);
    if (paragraphs.length < 2 || statements.length < 3) {
      return content;
    }
    const closing = paragraphs.pop()!;

    let expandedParagraphs = [...paragraphs];
    let currentWordCount = this.countWords(
      [...expandedParagraphs, closing].join('\n\n'),
    );
    const unused = statements.slice(3, 6).map((statement) => this.ensureSentence(statement));

    for (const statement of unused) {
      if (currentWordCount >= minWords) break;
      expandedParagraphs.push(
        `Additional verified context includes ${this.stripTrailingPeriod(statement).toLowerCase()}.`,
      );
      currentWordCount = this.countWords(
        [...expandedParagraphs, closing].join('\n\n'),
      );
    }

    return [...expandedParagraphs, closing].join('\n\n');
  }

  private countWords(text: string) {
    return text.split(/\s+/).filter(Boolean).length;
  }

  private splitParagraphs(text: string) {
    return text
      .split(/\n{2,}/)
      .map((segment) => segment.trim())
      .filter(Boolean);
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
      const regex = new RegExp(
        `\\b${this.escapeRegExp(trimmed)}\\b`,
        'gi',
      );
      sanitized = sanitized.replace(regex, '');
    }
    return sanitized
      .replace(/[\u2013\u2014]/g, ',')
      .replace(/\s+-\s+/g, ' ')
      .replace(/\s{2,}/g, ' ')
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
      segments.push(
        `Allowed companies: ${constraints.allowedCompanyNames.join(', ')}.`,
      );
    }
    if (constraints.allowedRoleTitles?.length) {
      segments.push(
        `Allowed titles: ${constraints.allowedRoleTitles.join(', ')}.`,
      );
    }
    if (constraints.disallowPhrases?.length) {
      segments.push(
        `Avoid phrases such as ${constraints.disallowPhrases.join(', ')}.`,
      );
    }
    if (constraints.disallowRoleTitles?.length) {
      segments.push(
        `Avoid titles such as ${constraints.disallowRoleTitles.join(', ')}.`,
      );
    }
    if (constraints.notes) {
      segments.push(constraints.notes);
    }

    return segments.length ? segments.join(' ') : null;
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
    return disallowList.some(
      (value) => value && normalized.includes(value.toLowerCase()),
    );
  }

  private cleanList(items: string[]) {
    return items
      .map((item) => this.cleanText(item))
      .filter(Boolean);
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
    const sanitized = this.sanitizeSentence(text);
    if (!sanitized) {
      return '';
    }
    return /[.!?]$/.test(sanitized) ? sanitized : `${sanitized}.`;
  }

  private sanitizeSentence(text: string) {
    return this.cleanText(text)
      .replace(/[\u2013\u2014]/g, ',')
      .replace(/\s+-\s+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}
