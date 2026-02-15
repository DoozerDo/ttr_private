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
  // Enforce a one-page limit: cap output to ~350 words to stay within a standard printed page (R7 one-page limit).
  private readonly hardCap = 350;

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
    const focusAreas = this.buildFocusAreas(constrainedJob);
    const tone = input.tone?.trim() || null;
    const safeMode = Boolean(input.safeMode);

    const paragraphs = safeMode
      ? [
          this.composeSafeIntro(constrainedJob, tone),
          this.composeSafeStrengths(baselineStatements, tone),
          this.composeSafeExecution(constrainedJob),
          this.composeSafeClosing(
            constrainedJob,
            tone,
            input.closingTemplate.text,
          ),
        ]
      : [
          this.composeIntro(constrainedJob, tone),
          this.composeStrengths(baselineStatements, tone),
          this.composeExecution(constrainedJob, focusAreas, baselineStatements),
          this.composeClosing(
            constrainedJob,
            tone,
            input.closingTemplate.text,
          ),
        ];

    const greeting = 'Dear Hiring Team,';
    const trimmedParagraphs = paragraphs
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    const closingParagraph = trimmedParagraphs.pop() ?? '';
    const bodyParagraphs = [...trimmedParagraphs];

    let content = [greeting, ...bodyParagraphs, closingParagraph]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    content = this.removeDisallowedPhrases(content, constraints);

    let wordCount = this.countWords(content);

    if (wordCount > this.hardCap) {
      content = this.trimToWordLimit(content, this.hardCap);
      wordCount = this.countWords(content);
    } else if (wordCount > targetWords) {
      content = this.trimToWordLimit(content, targetWords);
      wordCount = this.countWords(content);
    }

    const finalParagraphs = this.splitParagraphs(content);
    let finalGreeting = greeting;
    if (finalParagraphs.length && /^dear\\b/i.test(finalParagraphs[0])) {
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

    const clamped = Math.min(Math.max(Math.floor(maxWords), 250), this.hardCap);
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

    return statements.slice(0, 15);
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

  private buildFocusAreas(job: NormalizedJob) {
    const merged = [...job.responsibilities, ...job.requirements];
    const unique = Array.from(
      new Set(merged.map((item) => item.toLowerCase())),
    );

    return unique
      .map((key) => merged.find((item) => item.toLowerCase() === key) || key)
      .slice(0, 10);
  }

  private composeIntro(job: NormalizedJob, tone: string | null) {
    const roleDescriptor = this.describeRole(job);
    const toneLine = tone ? ` I will maintain a ${tone} tone throughout.` : '';

    return `I am applying for ${roleDescriptor}. I prepared this cover letter directly from the approved baseline text and the responsibilities you provided, keeping every statement grounded in verified details.${toneLine} I will highlight the portions of my record that align with the description and avoid adding claims that are not supported.`;
  }

  private composeSafeIntro(job: NormalizedJob, tone: string | null) {
    const roleDescriptor = this.describeRole(job);
    const toneLine = tone ? ` I will maintain a ${tone} tone throughout.` : '';

    return `I am applying for ${roleDescriptor}. This letter relies solely on the approved baseline text and the responsibilities you shared, keeping every claim anchored to verified content and avoiding speculation.${toneLine}`;
  }

  private composeStrengths(statements: string[], tone: string | null) {
    const toneLine = tone
      ? ` The same ${tone} style appears across these examples.`
      : '';

    if (statements.length === 0) {
      return `The approved baseline focuses on the way I plan work, collaborate with partners, and document outcomes in plain language.${toneLine} I will rely solely on that text to describe my strengths and keep the narrative consistent with verified material.`;
    }

    const highlights = statements.slice(0, 3);

    return `Documented experience from the baseline includes ${this.formatList(highlights)}.${toneLine} These lines come directly from the allowed sections, keeping the narrative factual and consistent. Additional baseline notes reinforce how I organize projects, share progress, and keep commitments modest and clear.`;
  }

  private composeSafeStrengths(statements: string[], tone: string | null) {
    const toneLine = tone
      ? ` The same ${tone} style appears across these passages.`
      : '';

    if (statements.length === 0) {
      return `The approved baseline emphasizes how I plan work, collaborate with teammates, and document outcomes in plain language.${toneLine} I will stick to that verified material when describing strengths.`;
    }

    const highlights = statements.slice(0, 2);

    return `The allowed baseline highlights ${this.formatList(highlights)}.${toneLine} Each sentence comes directly from approved content so every strength remains verifiable.`;
  }

  private composeExecution(
    job: NormalizedJob,
    focusAreas: string[],
    statements: string[],
  ) {
    const priorities =
      focusAreas.length > 0
        ? this.formatList(focusAreas)
        : 'the listed responsibilities and requirements';
    const references = statements.slice(3, 7);
    const referenceLine = references.length
      ? ` When expectations align, I will reference passages such as ${this.formatList(references)} to show direct support.`
      : ' When expectations align, I will point back to the specific baseline passages that cover the work.';

    const neutralGuardrail =
      ' If any responsibility sits outside the documented baseline text, I will call out the gap immediately, ask for context, and proceed without implying experience I cannot prove.';

    const collaborationLine = job.company
      ? ` At ${job.company}, my plan is to confirm scope early, pair each priority with the most relevant baseline evidence, and document decisions so expectations remain clear.`
      : ' I will confirm scope early, pair each priority with the most relevant baseline evidence, and document decisions so expectations remain clear.';

    return `For priorities such as ${priorities}, I will map each expectation to the supporting baseline excerpts to keep the work anchored in verified material.${referenceLine}${neutralGuardrail}${collaborationLine}`;
  }

  private composeSafeExecution(job: NormalizedJob) {
    const priorities =
      job.responsibilities.length || job.requirements.length
        ? this.formatList([...job.responsibilities, ...job.requirements].slice(0, 4))
        : 'the listed responsibilities and requirements';

    const companySentence = job.company
      ? ` I will use the job posting at ${job.company} as a reference, matching each priority to the verified baseline excerpts before describing how I will proceed.`
      : ' I will use the job posting as a reference, matching each priority to the verified baseline excerpts before describing how I will proceed.';

    return `For priorities such as ${priorities}, I will rely on the approved baseline passages to describe how I plan to support the work without introducing claims that are outside those sections.${companySentence}`;
  }

  private composeClosing(
    job: NormalizedJob,
    tone: string | null,
    closingTemplate: string,
  ) {
    const roleDescriptor = this.describeRole(job);
    const toneLine = tone
      ? ` I will continue to communicate in the same ${tone} style.`
      : '';
    const companyLine = job.company
      ? ` I appreciate your consideration and am ready to share any additional approved excerpts that help ${job.company} make a confident decision.`
      : ' I appreciate your consideration and am ready to share any additional approved excerpts that help your team make a confident decision.';

    return `${closingTemplate} Thank you for reviewing how my documented background fits ${roleDescriptor}.${toneLine}${companyLine}`.trim();
  }

  private composeSafeClosing(
    job: NormalizedJob,
    tone: string | null,
    closingTemplate: string,
  ) {
    const roleDescriptor = this.describeRole(job);
    const toneLine = tone
      ? ` I will continue to communicate in the same ${tone} style.`
      : '';
    const companyLine = job.company
      ? ` I appreciate your consideration and will gladly share any additional approved excerpts that help ${job.company} understand how the baseline content supports ${roleDescriptor}.`
      : ' I appreciate your consideration and am ready to share any additional approved excerpts that help your team make a confident decision.';

    return `${closingTemplate} Thank you for reviewing how the verified baseline material supports ${roleDescriptor}.${toneLine}${companyLine}`.trim();
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
    return sanitized.replace(/\s{2,}/g, ' ').trim();
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
}
