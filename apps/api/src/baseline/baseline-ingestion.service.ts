import { BadRequestException, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ZodError } from 'zod';
import { normalizeText } from '../scoring/fit-score/fit-score.utils';
import { extractJobToolRequirements } from '../scoring/fit-score/tool-extractor';
import { BaselineSectionType } from './baseline-section.entity';
import { BaselineSchemaCore, BaselineSchemaCoreShape } from './baseline-schema';
import { BaselineParserService, ParsedSection } from './baseline-parser.service';
import { BaselineTextExtractor } from './baseline-text-extractor.service';
import { extractStructuredBaselineFromSections } from './structuredBaselineExtractor';
import {
  CriticalFlowEventType,
  CriticalFlowTrackerService,
} from '../support/critical-flow-tracker.service';

export type BaselineSourceFormat = 'docx' | 'pdf';

export type BaselineIngestionResult = {
  rawText: string;
  parsedSections: ParsedSection[];
  canonical: BaselineSchemaCoreShape;
  sourceFormat: BaselineSourceFormat;
};

type ParsingContext = {
  missingFields: string[];
  ambiguityFlags: string[];
  lowConfidence: Array<{ path: string; reason: string; snippet: string }>;
};

type Metric = { type: 'percentage' | 'currency' | 'count'; value: string };

function isContactLikeText(value: string): boolean {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return true;
  return (
    /\b(?:https?:\/\/|www\.|linkedin\.com|github\.com|mailto:)\b/i.test(text) ||
    /@/.test(text) ||
    /\+?\d[\d\s().-]{7,}\d/.test(text)
  );
}

function isStandaloneSectionHeadingLine(value: string): boolean {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return /^(?:summary|professional summary|profile|experience|professional experience|work experience|skills|technical skills|key skills|education|academic background|training|projects?|programs?)\b$/i.test(
    text,
  );
}

function normalizeExperienceHeaderSeparatorText(value: string): string {
  return String(value ?? '')
    .replace(/\s*[\u2013\u2014]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyExperienceEntryTitle(value: string): boolean {
  const text = normalizeExperienceHeaderSeparatorText(value);
  if (!text) return false;
  if (/^(?:summary|professional summary|profile|experience|professional experience|work experience|skills|technical skills|education|projects?)$/i.test(text)) {
    return false;
  }
  if (text.includes('|')) return true;
  if (/\s-\s/.test(text)) return true;
  if (/\bat\b/i.test(text)) return true;
  return false;
}

function shouldPromoteSectionTitleToExperienceContent(section: ParsedSection): boolean {
  const title = normalizeExperienceHeaderSeparatorText(String(section?.title ?? ''));
  if (!isLikelyExperienceEntryTitle(title)) return false;
  const content = typeof section?.content === 'string' ? section.content.trim() : '';
  if (!content) return true;
  const firstContentLine = content
    .split(/\r?\n/)
    .map((line) => String(line ?? '').replace(/\s+/g, ' ').trim())
    .find(Boolean) ?? '';
  if (!firstContentLine) return true;
  return normalizeExperienceHeaderSeparatorText(firstContentLine) !== title;
}

function mapStructuredExperienceToCanonical(
  entries: Array<{ company: string; roleTitle: string; dates?: string; bullets: string[] }>,
): BaselineSchemaCoreShape['experience'] {
  const mapped = entries
    .map((entry, index) => {
      const company = String(entry.company ?? '').trim();
      const role = String(entry.roleTitle ?? '').trim();
      if (!company || !role) return null;
      const bullets = Array.isArray(entry.bullets)
        ? entry.bullets.map((bullet) => String(bullet ?? '').trim()).filter(Boolean)
        : [];
      if (!bullets.length) return null;
      const evidence = bullets.map((text, evidenceIndex) => ({
        id: `ingestion-structured-experience-${index}-evidence-${evidenceIndex}`,
        text,
        metrics: [] as Array<{ type: 'percentage' | 'currency' | 'count'; value: string }>,
        tags: [role.toLowerCase()],
      }));
      const dates = String(entry.dates ?? '').trim();
      const [startDate, endDate] = dates
        ? (() => {
            const normalized = normalizeExperienceHeaderSeparatorText(dates).replace(/\s+-\s+/g, ' - ');
            const parts = normalized.split(' - ').map((part) => part.trim()).filter(Boolean);
            if (parts.length >= 2) {
              return [parts[0], parts.slice(1).join(' - ')] as const;
            }
            return [parts[0] ?? null, null] as const;
          })()
        : [null, null];
      return {
        company,
        role,
        ...(startDate ? { start_date: startDate } : {}),
        ...(endDate ? { end_date: endDate } : {}),
        evidence,
        company_name: company,
        role_title: role,
        scope_summary: bullets.join(' '),
        details_text: bullets.join('\n'),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  return mapped as BaselineSchemaCoreShape['experience'];
}

function summarizeThematicEvidenceFields(canonical: Record<string, unknown>) {
  const inspect = (field: string, value: unknown) => {
    const hasContent =
      Array.isArray(value)
        ? value.length > 0
        : value && typeof value === 'object'
          ? Object.values(value as Record<string, unknown>).some((item) => {
              if (Array.isArray(item)) return item.length > 0;
              if (typeof item === 'string') return item.trim().length > 0;
              return item !== null && item !== undefined && item !== false;
            })
          : typeof value === 'string'
            ? value.trim().length > 0
            : value !== null && value !== undefined && value !== false;

    return {
      field,
      hasContent,
      rejectionReason: hasContent ? 'missing_company_role_dates_bullets' : 'empty_thematic_field',
      sample:
        typeof value === 'string'
          ? value.slice(0, 120)
          : Array.isArray(value)
            ? value
                .map((item) => String(item ?? '').trim())
                .filter(Boolean)
                .slice(0, 3)
                .join(' | ')
                .slice(0, 120)
            : value && typeof value === 'object'
              ? JSON.stringify(Object.entries(value as Record<string, unknown>).slice(0, 4)).slice(0, 120)
              : String(value ?? '').slice(0, 120),
    };
  };

  return [
    inspect('people_leadership', canonical.people_leadership),
    inspect('operational_ownership', canonical.operational_ownership),
    inspect('tooling_and_platforms', canonical.tooling_and_platforms),
    inspect('cross_functional_partnership', canonical.cross_functional_partnership),
    inspect('customer_advocacy', canonical.customer_advocacy),
    inspect('scale_and_scope', canonical.scale_and_scope),
    inspect('metrics_and_outcomes', canonical.metrics_and_outcomes),
    inspect('skills_and_tools', canonical.skills_and_tools),
  ];
}

@Injectable()
export class BaselineIngestionService {
  private readonly logger = new Logger(BaselineIngestionService.name);

  /**
   * AUTHORITY: Baseline parsing + canonical normalization orchestrator.
   *
   * `BaselineParserService` supports multiple strategies (`rules` vs `llm`). Strategy selection
   * must remain centralized here to prevent competing baseline truth across controllers/services.
   *
   * Current behavior: parsing uses the default parser strategy (rules) by calling `parseBaseline(rawText)`
   * with no strategy override.
   */
  constructor(
    private readonly baselineParser: BaselineParserService,
    private readonly baselineTextExtractor: BaselineTextExtractor,
    private readonly criticalFlowTrackerService?: CriticalFlowTrackerService,
  ) {}

  /**
   * Production baseline parsing strategy.
   *
   * Current policy is explicitly `rules` to avoid hidden strategy switching in production.
   * A future, config-owned policy may allow `llm`, but that decision must remain centralized here.
   */
  private getBaselineParseStrategy(): 'rules' | 'llm' {
    return 'rules';
  }

  private parseBaselineWithPolicy(rawText: string): ParsedSection[] {
    return this.baselineParser.parseBaseline(rawText, {
      strategy: this.getBaselineParseStrategy(),
    });
  }

  async ingest(file: Express.Multer.File): Promise<BaselineIngestionResult> {
    try {
      const sourceFormat = this.detectFormat(file);
      const rawText = await this.baselineTextExtractor.extractText(file);
      if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
        try {
          // eslint-disable-next-line no-console
          console.log('[BASELINE_INGEST][RAW_TEXT_EXTRACTED]', {
            sourceFormat,
            rawTextLength: rawText.length,
            rawLineCount: String(rawText).split(/\r?\n/).filter(Boolean).length,
            preview: String(rawText).slice(0, 240),
          });
        } catch {
          // ignore
        }
      }
      const parsedSections = this.parseBaselineWithPolicy(rawText);
      const canonical = this.buildCanonical(rawText, parsedSections);
      if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
        try {
          const byType = parsedSections.reduce<Record<string, number>>((acc, section) => {
            const key = String(section.sectionType ?? 'UNKNOWN');
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {});
          const headings = parsedSections
            .map((s) => String(s.title ?? '').trim())
            .filter(Boolean)
            .slice(0, 20);
          const experienceContent = parsedSections
            .filter((s) => s.sectionType === BaselineSectionType.EXPERIENCE)
            .map((s) => s.content)
            .join('\n');
          // eslint-disable-next-line no-console
          console.log('[BASELINE_INGEST][PARSE_SUMMARY]', {
            sourceFormat,
            rawTextLength: rawText.length,
            rawLineCount: String(rawText).split(/\r?\n/).filter(Boolean).length,
            parsedSectionCount: parsedSections.length,
            sectionTypeCounts: byType,
            detectedHeadings: headings,
            experienceSectionChars: experienceContent.length,
            canonicalExperienceCount: Array.isArray((canonical as any)?.experience) ? (canonical as any).experience.length : null,
          });
        } catch {
          // ignore
        }
      }
      this.logger.debug(`Baseline ingested (${sourceFormat})`);
      void this.criticalFlowTrackerService?.recordCriticalFlowEvent({
        flow: CriticalFlowEventType.BASELINE_PARSED_SUCCESS,
        areaOrRoute: 'baseline',
      });
      return { rawText, parsedSections, canonical, sourceFormat };
    } catch (error) {
      void this.criticalFlowTrackerService?.recordCriticalFlowEvent({
        flow: CriticalFlowEventType.BASELINE_PARSED_FAILURE,
        areaOrRoute: 'baseline',
      });
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof ZodError) {
        throw new UnprocessableEntityException({
          error: {
            code: 'BASELINE_CANONICAL_PARSE_FAILED',
            message: 'We could not normalize this baseline into a supported structure.',
            issues: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        });
      }
      throw error;
    }
  }

  async ingestFromText(
    rawText: string,
    sourceFormat: BaselineSourceFormat,
  ): Promise<BaselineIngestionResult> {
    const parsedSections = this.parseBaselineWithPolicy(rawText);
    const canonical = this.buildCanonical(rawText, parsedSections);
    return { rawText, parsedSections, canonical, sourceFormat };
  }

  private detectFormat(file: Express.Multer.File): BaselineSourceFormat {
    return path.extname(file.originalname || file.path || '').toLowerCase() ===
      '.pdf'
      ? 'pdf'
      : 'docx';
  }

  private buildCanonical(
    rawText: string,
    parsedSections: ParsedSection[],
  ): BaselineSchemaCoreShape {
    const context: ParsingContext = {
      missingFields: [],
      ambiguityFlags: [],
      lowConfidence: [],
    };
    const experience = this.buildExperience(parsedSections, context);
    const identity = this.buildIdentity(rawText, experience, context);
    const normalized = normalizeText(rawText);
    const tooling = this.buildToolingAndSkills(normalized);
    const education = this.buildEducation(parsedSections);
    const skills = this.buildSkills(parsedSections);
    const peopleLeadership = this.buildPeopleLeadership(normalized, context);
    const operationalOwnership = this.buildOperationalOwnership(normalized);
    const crossFunctional = this.buildCrossFunctional(normalized);
    const customerAdvocacy = this.buildCustomerAdvocacy(normalized);
    const scaleAndScope = this.buildScaleAndScope(normalized);
    const metrics = this.buildMetrics(normalized);
    const skillsAndTools = this.buildSkillsAndTools(normalized, tooling.tools);
    if (experience.length === 0) {
      context.lowConfidence.push(
        ...summarizeThematicEvidenceFields({
          identity,
          experience,
          education,
          skills,
          people_leadership: peopleLeadership,
          operational_ownership: operationalOwnership,
          tooling_and_platforms: tooling,
          cross_functional_partnership: crossFunctional,
          customer_advocacy: customerAdvocacy,
          scale_and_scope: scaleAndScope,
          metrics_and_outcomes: metrics,
          skills_and_tools: skillsAndTools,
          system_generated_read_only: {
            missing_fields: [],
            ambiguity_flags: [],
            low_confidence_extractions: [],
          },
        }).filter((entry) => entry.hasContent)
          .map((entry) => ({
            path: `thematic.${entry.field}`,
            reason: entry.rejectionReason,
            snippet: entry.sample,
          })),
      );
    }

    return BaselineSchemaCore.parse({
      identity,
      summary: identity.summary ?? null,
      experience,
      education,
      skills,
      people_leadership: peopleLeadership,
      operational_ownership: operationalOwnership,
      tooling_and_platforms: tooling,
      cross_functional_partnership: crossFunctional,
      customer_advocacy: customerAdvocacy,
      scale_and_scope: scaleAndScope,
      metrics_and_outcomes: metrics,
      skills_and_tools: skillsAndTools,
      system_generated_read_only: {
        missing_fields: context.missingFields,
        ambiguity_flags: context.ambiguityFlags,
        low_confidence_extractions: context.lowConfidence,
      },
    });
  }

  private buildIdentity(
    rawText: string,
    experience: BaselineSchemaCoreShape['experience'],
    context: ParsingContext,
  ): BaselineSchemaCoreShape['identity'] {
    const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const fullName =
      lines.find((line) => line.split(/\s+/).length >= 2 && !/^(summary|experience|skills|education)/i.test(line)) ??
      null;
    if (!fullName) context.missingFields.push('identity.full_name');
    const firstExperience = experience[0];
    return {
      full_name: fullName,
      summary: this.extractSummary(rawText),
      current_title: firstExperience?.role ?? firstExperience?.role_title ?? null,
      current_company:
        firstExperience?.company ?? firstExperience?.company_name ?? null,
      location: this.extractLocation(rawText),
    };
  }

  private extractSummary(rawText: string): string | null {
    const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const index = lines.findIndex((line) => /^(summary|professional summary|profile)\b/i.test(line));
    return index >= 0 && lines[index + 1] ? this.cleanEvidenceText(lines[index + 1]) : null;
  }

  private extractLocation(text: string): string | null {
    const match = text.match(/\b(?:based in|location[:]\s*)([^\n,]+)/i);
    return match ? match[1].trim() : null;
  }

  private buildExperience(
    parsedSections: ParsedSection[],
    context: ParsingContext,
  ): BaselineSchemaCoreShape['experience'] {
    const experienceSections = parsedSections.filter(
      (section) => section.sectionType === BaselineSectionType.EXPERIENCE,
    );
    const content = experienceSections
      .map((section) => section.content)
      .join('\n')
      .trim();

    const selectedContents = content
      ? [content]
      : parsedSections
          .map((section) => String(section.content ?? '').trim())
          .filter(Boolean);

    if (!selectedContents.length) {
      if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
        try {
          const titles = parsedSections
            .map((s) => String(s.title ?? '').trim())
            .filter(Boolean)
            .slice(0, 20);
          // eslint-disable-next-line no-console
          console.warn('[BASELINE_INGEST][EXPERIENCE_EMPTY_AFTER_PARSE]', {
            parsedSectionCount: parsedSections.length,
            parsedExperienceSectionCount: experienceSections.length,
            usedFallbackExperienceContent: false,
            detectedHeadings: titles,
          });
        } catch {
          // ignore
        }
      }
      context.missingFields.push('experience');
      return [];
    }
    const blocks = selectedContents.flatMap((sectionContent) => this.groupExperienceBlocks(sectionContent));
    if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
      try {
        // eslint-disable-next-line no-console
        console.log('[BASELINE_INGEST][EXPERIENCE_BLOCKS]', {
          sectionContentCount: selectedContents.length,
          usedFallbackExperienceContent: !content,
          explicitExperienceSectionCount: experienceSections.length,
          blockCount: blocks.length,
          firstBlockPreview: blocks[0]?.slice(0, 160) ?? null,
        });
      } catch {
        // ignore
      }
    }
    const experience = blocks.flatMap((block) => this.parseExperienceBlock(block, context));
    if (experience.length > 0) {
      return experience;
    }

    const promotedSections = parsedSections.map((section) => {
      if (!shouldPromoteSectionTitleToExperienceContent(section)) return section;
      const title = normalizeExperienceHeaderSeparatorText(String(section?.title ?? ''));
      const content = typeof section.content === 'string' ? section.content.trim() : '';
      return {
        ...section,
        sectionType: BaselineSectionType.EXPERIENCE,
        content: content ? `${title}\n${content}` : title,
      };
    });

    const structured = extractStructuredBaselineFromSections(promotedSections as any);
    const structuredExperience = mapStructuredExperienceToCanonical(
      Array.isArray((structured as any)?.experience)
        ? ((structured as any).experience as Array<{ company: string; roleTitle: string; dates?: string; bullets: string[] }>)
        : [],
    );
    if (structuredExperience.length > 0) {
      return structuredExperience;
    }
    return experience;
  }

  private groupExperienceBlocks(content: string): string[] {
    const lines = content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) return [];

    const groupedBlocks: string[] = [];
    let currentBlock: string[] = [];

    const flushCurrentBlock = () => {
      const block = currentBlock.join('\n').trim();
      if (block) {
        groupedBlocks.push(block);
      }
      currentBlock = [];
    };

    for (const line of lines) {
      if (isStandaloneSectionHeadingLine(line)) {
        flushCurrentBlock();
        continue;
      }
      const header = this.parseExperienceHeader(line);
      const isHeaderLine = Boolean(header.company && header.role);

      if (isHeaderLine) {
        flushCurrentBlock();
        currentBlock.push(line);
        continue;
      }

      if (currentBlock.length > 0) {
        currentBlock.push(line);
      }
    }

    flushCurrentBlock();

    if (groupedBlocks.length > 0) {
      return groupedBlocks;
    }

    return content
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
  }

  private parseExperienceBlock(block: string, context: ParsingContext): BaselineSchemaCoreShape['experience'] {
    const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0];
    const parsedHeader = this.parseExperienceHeader(header);
    if (!parsedHeader.company || !parsedHeader.role) {
      context.missingFields.push('experience.company_or_role');
      return [];
    }
    if (isContactLikeText(parsedHeader.company) || isContactLikeText(parsedHeader.role)) {
      context.missingFields.push('experience.company_or_role');
      return [];
    }
    const body = lines.slice(1);
    const role = parsedHeader.role;
    if (!role) {
      context.missingFields.push('experience.company_or_role');
      return [];
    }
    const evidence = body
      .flatMap((line) => this.splitIntoEvidence(line))
      .map((text) => this.cleanEvidenceText(text))
      .filter((text) => text.length > 0 && !this.isExperienceNoiseLine(text))
      .map((text) => ({
      id: randomUUID(),
      text,
      metrics: this.extractMetrics(text),
      tags: [role.toLowerCase()],
    }))
      .filter((unit) => unit.text.length > 0);
    if (evidence.length === 0) {
      context.missingFields.push('experience.bullets');
      return [];
    }
    return [{
      company: parsedHeader.company,
      role: parsedHeader.role,
      start_date: parsedHeader.start,
      end_date: parsedHeader.end,
      evidence,
      company_name: parsedHeader.company,
      role_title: parsedHeader.role,
      scope_summary: evidence.map((item) => item.text).join(' '),
      details_text: evidence.map((item) => item.text).join('\n'),
    }];
  }

  private isExperienceNoiseLine(line: string): boolean {
    const text = this.cleanEvidenceText(line);
    if (!text) return true;
    if (/\b(?:summary|professional summary|profile)\b/i.test(text)) {
      return true;
    }
    if (/^(experience|professional experience|work experience|skills|technical skills|education|certifications?)\b/i.test(text)) {
      return true;
    }
    if (/\b(?:https?:\/\/|www\.|linkedin\.com|github\.com|mailto:)\b/i.test(text) || /@/.test(text)) {
      return true;
    }
    if (/\+?\d[\d\s().-]{7,}\d/.test(text)) {
      return true;
    }
    if (
      text.split(/\s+/).length <= 12 &&
      (
        /\b(?:19|20)\d{2}\b.*(?:[-–—]|to).*\b(?:19|20)\d{2}\b/i.test(text) ||
        (/\b(?:19|20)\d{2}\b/.test(text) && /\b(?:present|current)\b/i.test(text))
      )
    ) {
      return true;
    }
    return false;
  }

  private parseExperienceHeader(header: string): { company: string | null; role: string | null; start: string | null; end: string | null } {
    const normalized = this.cleanEvidenceText(header);
    const { start, end } = this.extractDates(normalized);
    const stripped = normalized.replace(/(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4})\s*(?:[-–—]|to)\s*(present|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4})/i, '');
    const parts = stripped.split(/\s*[|@]\s*|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return { company: parts[0], role: parts.slice(1).join(' | '), start, end };
    return { company: null, role: null, start, end };
  }

  private splitIntoEvidence(text: string): string[] {
    const cleaned = text.replace(/^[\s•·\-–—]+/, '').trim();
    if (!cleaned) return [];
    return cleaned.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
  }

  private cleanEvidenceText(text: string): string {
    return text
      .replace(/^[\s•·\-–—]+/, '')
      .replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .trim();
  }

  private extractMetrics(text: string): Metric[] {
    return [...text.matchAll(/(\$[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%|\b\d+\b)/g)].map((match) => {
      const value = match[1];
      return {
        type: value.startsWith('$') ? 'currency' : value.endsWith('%') ? 'percentage' : 'count',
        value,
      };
    });
  }

  private splitEducationLines(text: string): string[] {
    return text.split(/\n+/).map((line) => this.cleanEvidenceText(line)).filter(Boolean);
  }

  private dedupeEducationTokens(text: string): string {
    return text.replace(/\b(\w+)(?:\s*\|\s*\1)+/gi, '$1').trim();
  }

  private buildEducation(parsedSections: ParsedSection[]): BaselineSchemaCoreShape['education'] {
    const section = parsedSections.find((item) => item.sectionType === BaselineSectionType.EDUCATION);
    if (!section) return [];
    return this.splitEducationLines(section.content).map((line) => ({
      school: this.dedupeEducationTokens(line),
      degree: this.dedupeEducationTokens(line),
      startDate: null,
      endDate: null,
      evidence: [{ id: randomUUID(), text: line, metrics: this.extractMetrics(line), tags: ['education'] }],
    }));
  }

  private buildSkills(parsedSections: ParsedSection[]): BaselineSchemaCoreShape['skills'] {
    const section = parsedSections.find((item) => item.sectionType === BaselineSectionType.SKILLS);
    if (!section) return [];
    return section.content
      .split(/[\n,|]/)
      .map((item) => this.cleanEvidenceText(item))
      .filter(Boolean)
      .map((name) => ({ name, category: null }));
  }

  private extractDates(section: string) {
    const match = section.match(/(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4})\s*(?:[-–—]|to)\s*(present|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4})/i);
    if (!match) return { start: null, end: null };
    return { start: match[1].trim(), end: match[2].toLowerCase() === 'present' ? 'present' : match[2].trim() };
  }

  private buildPeopleLeadership(text: string, context: ParsingContext): BaselineSchemaCoreShape['people_leadership'] {
    const match = text.toLowerCase().match(/managed\s+(\d+)\s+(direct reports|people)/i);
    if (!match) context.missingFields.push('people_leadership.direct_reports');
    return {
      direct_reports: match ? Number(match[1]) : null,
      managers_led: /managed\s+managers?/.test(text.toLowerCase()) ? true : null,
      global_teams: /global\s+teams?/.test(text.toLowerCase()) ? true : null,
    };
  }

  private buildOperationalOwnership(text: string): BaselineSchemaCoreShape['operational_ownership'] {
    const lower = text.toLowerCase();
    return {
      functions_owned: ['incident management', 'problem management', 'escalations', 'tooling', 'knowledge base', 'qa'].filter((keyword) => lower.includes(keyword)),
      process_design: /process design/.test(lower) ? true : null,
      process_scaling: /(process scaling|scaled processes)/.test(lower) ? true : null,
    };
  }

  private buildToolingAndSkills(text: string): BaselineSchemaCoreShape['tooling_and_platforms'] {
    const requirements = extractJobToolRequirements(text);
    return {
      tools: Array.from(new Set([...requirements.required, ...requirements.preferred].map((entry) => entry.toLowerCase()))),
      ownership_level: this.detectOwnershipLevel(text),
    };
  }

  private detectOwnershipLevel(text: string): 'used' | 'administered' | 'owned' | 'implemented' | 'unknown' {
    const lower = text.toLowerCase();
    if (/(owned|owning)/.test(lower)) return 'owned';
    if (/administered/.test(lower)) return 'administered';
    if (/implemented/.test(lower)) return 'implemented';
    return 'unknown';
  }

  private buildCrossFunctional(text: string): BaselineSchemaCoreShape['cross_functional_partnership'] {
    const lower = text.toLowerCase();
    return { product: /product/.test(lower) ? true : null, engineering: /engineering/.test(lower) ? true : null, sales_cs: /(sales|customer success|cs)/.test(lower) ? true : null, executive: /(executive|c-level|c level)/.test(lower) ? true : null };
  }

  private buildCustomerAdvocacy(text: string): BaselineSchemaCoreShape['customer_advocacy'] {
    const lower = text.toLowerCase();
    return { executive_escalations: /executive escalation/.test(lower) ? true : null, voice_of_customer: /voice of the customer|voc/.test(lower) ? true : null, post_incident_rca: /\b(rca|root cause analysis|post incident rca)\b/.test(lower) ? true : null };
  }

  private buildScaleAndScope(text: string): BaselineSchemaCoreShape['scale_and_scope'] {
    const lower = text.toLowerCase();
    return {
      customer_segment: lower.includes('smb') ? 'smb' : lower.includes('mid market') || lower.includes('mid-market') ? 'mid_market' : lower.includes('enterprise') ? 'enterprise' : 'unknown',
      geo_scope: lower.includes('global') ? 'global' : lower.includes('regional') ? 'regional' : 'unknown',
      org_stage: lower.includes('public') ? 'public' : lower.includes('growth') ? 'growth' : lower.includes('early') ? 'early' : 'unknown',
    };
  }

  private buildMetrics(text: string): BaselineSchemaCoreShape['metrics_and_outcomes'] {
    const metrics = text.split(/\n/).filter((line) => /\d+/.test(line) && /(increase|improve|growth|revenue|percent|%)/i.test(line)).map((line) => line.trim());
    return { metrics_present: metrics.length > 0, metrics };
  }

  private buildSkillsAndTools(text: string, toolingTools: string[]): BaselineSchemaCoreShape['skills_and_tools'] {
    const lower = text.toLowerCase();
    return {
      tools: Array.from(new Set(toolingTools)),
      methodologies: ['agile', 'scrum', 'kanban', 'itil', 'devops', 'waterfall', 'lean'].filter((keyword) => lower.includes(keyword)),
      domains: ['SaaS', 'Enterprise IT', 'MSP', 'Regulated', 'Internal Delivery', 'External Delivery'].filter((label) => lower.includes(label.toLowerCase())),
    };
  }
}
