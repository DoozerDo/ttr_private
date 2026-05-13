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

    return BaselineSchemaCore.parse({
      identity,
      summary: identity.summary ?? null,
      experience,
      education,
      skills,
      people_leadership: this.buildPeopleLeadership(normalized, context),
      operational_ownership: this.buildOperationalOwnership(normalized),
      tooling_and_platforms: tooling,
      cross_functional_partnership: this.buildCrossFunctional(normalized),
      customer_advocacy: this.buildCustomerAdvocacy(normalized),
      scale_and_scope: this.buildScaleAndScope(normalized),
      metrics_and_outcomes: this.buildMetrics(normalized),
      skills_and_tools: this.buildSkillsAndTools(normalized, tooling.tools),
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
    const content = parsedSections
      .filter((section) => section.sectionType === BaselineSectionType.EXPERIENCE)
      .map((section) => section.content)
      .join('\n');
    if (!content.trim()) {
      if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
        try {
          const titles = parsedSections
            .map((s) => String(s.title ?? '').trim())
            .filter(Boolean)
            .slice(0, 20);
          // eslint-disable-next-line no-console
          console.warn('[BASELINE_INGEST][EXPERIENCE_EMPTY_AFTER_PARSE]', {
            parsedSectionCount: parsedSections.length,
            parsedExperienceSectionCount: parsedSections.filter((s) => s.sectionType === BaselineSectionType.EXPERIENCE).length,
            detectedHeadings: titles,
          });
        } catch {
          // ignore
        }
      }
      context.missingFields.push('experience');
      return [];
    }
    const blocks = content.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
    if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
      try {
        // eslint-disable-next-line no-console
        console.log('[BASELINE_INGEST][EXPERIENCE_BLOCKS]', {
          experienceChars: content.length,
          blockCount: blocks.length,
          firstBlockPreview: blocks[0]?.slice(0, 160) ?? null,
        });
      } catch {
        // ignore
      }
    }
    const experience = blocks.flatMap((block) => this.parseExperienceBlock(block, context));
    return experience;
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
    const body = lines.slice(1);
    const role = parsedHeader.role;
    if (!role) {
      context.missingFields.push('experience.company_or_role');
      return [];
    }
    const evidence = body.flatMap((line) => this.splitIntoEvidence(line)).map((text) => ({
      id: randomUUID(),
      text: this.cleanEvidenceText(text),
      metrics: this.extractMetrics(text),
      tags: [role.toLowerCase()],
    })).filter((unit) => unit.text.length > 0);
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
