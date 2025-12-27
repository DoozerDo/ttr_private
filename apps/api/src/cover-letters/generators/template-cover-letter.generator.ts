import {
  AllowedBaselineBlock,
  CoverLetterGenerationInput,
  CoverLetterGenerationResult,
  CoverLetterGenerator,
  CoverLetterJobContext,
} from './cover-letter-generator.interface';

type NormalizedJobContext = CoverLetterJobContext & {
  title: string | null;
  company: string | null;
  responsibilities: string[];
  requirements: string[];
};

export class TemplateCoverLetterGenerator implements CoverLetterGenerator {
  generate(input: CoverLetterGenerationInput): CoverLetterGenerationResult {
    const wordLimit = this.resolveWordLimit(input.maxWords);
    const normalizedJob = this.normalizeJob(input.job);
    const tone = input.tone?.trim() || null;
    const focusAreas = this.buildFocusAreas(normalizedJob);
    const baselineSnippets = this.extractBaselineSnippets(
      input.allowedBaselineBlocks,
    );

    const intro = this.buildIntroParagraph(normalizedJob, tone);
    const strengths = this.buildStrengthsParagraph(
      baselineSnippets,
      focusAreas,
      tone,
    );
    const execution = this.buildExecutionParagraph(
      normalizedJob,
      baselineSnippets,
      focusAreas,
    );
    const closing = this.buildClosingParagraph(normalizedJob, tone);

    let content = [intro, strengths, execution, closing]
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0)
      .join('\n\n')
      .trim();

    let wordCount = this.countWords(content);
    if (wordCount > wordLimit) {
      content = this.trimToWordLimit(content, wordLimit);
      wordCount = this.countWords(content);
    }

    return {
      content,
      wordCount,
    };
  }

  private resolveWordLimit(maxWords?: number | null) {
    if (!maxWords || Number.isNaN(maxWords) || maxWords <= 0) {
      return 350;
    }

    const clamped = Math.min(Math.max(Math.floor(maxWords), 250), 400);
    return clamped;
  }

  private normalizeJob(job: CoverLetterJobContext): NormalizedJobContext {
    const sanitizeList = (items?: string[]) =>
      (items ?? [])
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item));

    return {
      ...job,
      title: job.title?.trim() || null,
      company: job.company?.trim() || null,
      responsibilities: sanitizeList(job.responsibilities),
      requirements: sanitizeList(job.requirements),
    };
  }

  private cleanText(text?: string | null) {
    return (text ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildFocusAreas(job: NormalizedJobContext) {
    const merged = [...job.responsibilities, ...job.requirements];
    const unique = Array.from(new Set(merged));
    return unique.slice(0, 8);
  }

  private extractBaselineSnippets(blocks: AllowedBaselineBlock[]) {
    const snippets: string[] = [];

    blocks
      .filter((block) => this.cleanText(block.content).length > 0)
      .sort((a, b) => a.order - b.order)
      .forEach((block) => {
        const cleaned = this.cleanText(block.content);
        const parts = cleaned
          .split(/(?<=[.!?])\s+|\n+/)
          .map((sentence) => sentence.trim())
          .filter((sentence) => sentence.length > 0);

        parts.forEach((part) => {
          const capped = this.limitWords(part, 60);
          if (capped.length > 0) {
            snippets.push(capped);
          }
        });
      });

    return snippets.slice(0, 12);
  }

  private buildIntroParagraph(job: NormalizedJobContext, tone: string | null) {
    const roleDescriptor =
      job.title && job.company
        ? `the ${job.title} role at ${job.company}`
        : job.title
          ? `the ${job.title} role`
          : job.company
            ? `an opening at ${job.company}`
            : 'the role you outlined';

    const toneDescriptor = tone ? ` in a ${tone} manner` : '';

    return `I am writing to express my interest in ${roleDescriptor}. I appreciate the chance to present a concise and candid overview of my background, focusing only on information that is already documented${toneDescriptor}. The baseline materials I provided outline my verified experience, and I will rely on those details as I address the responsibilities of the role. I will mirror the priorities listed in the job description and keep every statement anchored to that verified record.`;
  }

  private buildStrengthsParagraph(
    baselineSnippets: string[],
    focusAreas: string[],
    tone: string | null,
  ) {
    const highlightList = baselineSnippets.slice(0, 3);
    const experienceContext =
      baselineSnippets.length > 3
        ? `Beyond these highlights, the remaining baseline material provides additional context on how I approach planning, collaboration, and execution without overstating outcomes.`
        : 'The enclosed baseline content also captures how I plan work, collaborate with partners, and document progress without overextending claims.';

    const focusLine =
      focusAreas.length > 0
        ? `These experiences relate to priorities such as ${this.formatList(
            focusAreas.slice(0, 3),
          )}.`
        : 'These experiences give you a clear view of how I work and what I can contribute.';

    const tonePhrase = tone ? ` I communicate in a ${tone} voice` : '';

    if (highlightList.length === 0) {
      return `From my documented background, you will find detailed examples of how I operate.${tonePhrase} ${experienceContext} ${focusLine} Each excerpt comes directly from the approved baseline so the narrative stays factual and consistent.`;
    }

    return `Key points from my background include ${this.formatList(
      highlightList,
    )}.${tonePhrase} ${experienceContext} ${focusLine} Each excerpt comes directly from the approved baseline so the narrative stays factual and consistent.`;
  }

  private buildExecutionParagraph(
    job: NormalizedJobContext,
    baselineSnippets: string[],
    focusAreas: string[],
  ) {
    const supportedLine =
      baselineSnippets.length > 0
        ? `I will ground my approach in the practices and outcomes already recorded, such as ${this.formatList(
            baselineSnippets.slice(0, 2),
          )}.`
        : 'I will ground my approach in the practices and outcomes already recorded in my baseline.';

    const focusLine =
      focusAreas.length > 0
        ? `For responsibilities like ${this.formatList(
            focusAreas,
          )}, I will reference the documented work above, confirm expectations early, and avoid overstating experience when a requirement extends beyond that record.`
        : 'I will confirm expectations early and avoid overstating experience, keeping my work aligned with documented strengths.';

    const collaborationLine = job.company
      ? `At ${job.company}, I will collaborate closely to ensure every commitment is backed by evidence from my baseline.`
      : 'I will collaborate closely to ensure every commitment is backed by evidence from my baseline.';
    const neutralLine =
      'Where a requirement extends beyond the baseline, I will flag it early, seek clarity, and adjust plans so that delivery remains honest and dependable.';
    const workflowLine =
      'My plan is straightforward: clarify scope, pair each priority with the most relevant baseline evidence, outline checkpoints, and document decisions so that expectations stay aligned.';

    return `${supportedLine} ${focusLine} ${collaborationLine} ${neutralLine} ${workflowLine}`;
  }

  private buildClosingParagraph(job: NormalizedJobContext, tone: string | null) {
    const appreciation = job.company
      ? `Thank you for considering how my documented background can serve ${job.company}.`
      : 'Thank you for considering how my documented background can serve your team.';
    const roleReminder = job.title
      ? `I look forward to the possibility of discussing the ${job.title} role further`
      : 'I look forward to the possibility of discussing this opportunity further';
    const toneLine = tone ? ` and sharing more in the same ${tone} style` : '';
    const evidenceLine =
      ' I am prepared to share any additional excerpts from my baseline to keep our conversation precise and verifiable.';
    const nextStepLine =
      ' Please let me know a convenient time to connect, and I will prepare a brief walkthrough of the most relevant baseline highlights.';

    return `${appreciation} ${roleReminder}${toneLine}.${evidenceLine}${nextStepLine}`;
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
}
