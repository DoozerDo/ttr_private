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
  trace?: BaselineUploadTrace;
};

export type BaselineUploadTrace = {
  extractedText?: {
    textLength: number;
    workHistoryHeadingDetected: boolean;
    dateRangeCount: number;
  };
  parserOutput?: {
    sectionTypes: string[];
    experienceSectionCount: number;
    otherSectionCount: number;
  };
  canonicalParsedBaseline?: {
    experienceType: string;
    experienceCount: number;
    thematicFieldsPresent: boolean;
  };
  structuredBaselineExtractor?: {
    candidateHeaderCount: number;
    structuredExperienceCount: number;
    unsafeHeaderRejectionCount: number;
    rejectionReasons: string[];
  };
  baselineIngestion?: {
    candidateBlockCount: number;
    mappedExperienceCount: number;
    rejectedBlockCount: number;
    rejectionReasons: string[];
  };
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
  const digitCount = text.replace(/\D/g, '').length;
  return (
    /\b(?:https?:\/\/|www\.|linkedin\.com|github\.com|mailto:)\b/i.test(text) ||
    /@/.test(text) ||
    (digitCount >= 10 && /\+?\d[\d\s().-]{7,}\d/.test(text))
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

const MONTH_YEAR_TOKEN =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\s+(?:19|20)\\d{2}';
const MONTH_YEAR_RE = new RegExp(`\\b${MONTH_YEAR_TOKEN}\\b`, 'i');
const YEAR_TOKEN = '(?:19|20)\\d{2}';
const DATE_TOKEN = `(?:${MONTH_YEAR_TOKEN}|${YEAR_TOKEN})`;
const DATE_RANGE_SEPARATOR_TOKEN = '(?:\\s*(?:\\||[-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2015\\u2212])\\s*|\\s+to\\s+)';
const DATE_RANGE_RE = new RegExp(
  `\\b(${DATE_TOKEN})\\b${DATE_RANGE_SEPARATOR_TOKEN}(?:(${DATE_TOKEN})|(present|current))`,
  'i',
);
const DATE_RANGE_GLOBAL_RE = new RegExp(
  `\\b(${DATE_TOKEN})\\b${DATE_RANGE_SEPARATOR_TOKEN}(?:(${DATE_TOKEN})|(present|current))`,
  'gi',
);

function extractDateRangeMatch(value: string): { start: string; end: string; matchedText: string } | null {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const normalized = normalizeDateRangeSeparators(raw);
  const match = normalized.match(DATE_RANGE_RE);
  if (!match) return null;
  const start = String(match[1] ?? '').replace(/[),.;:]+$/, '').trim();
  const end = String(match[2] ?? match[3] ?? '').replace(/[),.;:]+$/, '').trim();
  if (!start || !end) return null;
  return {
    start,
    end: /\b(?:present|current)\b/i.test(end) ? 'Present' : end,
    matchedText: String(match[0] ?? '').trim(),
  };
}

function normalizeDateRangeSeparators(text: string): string {
  return String(text ?? '')
    .replace(/\u00C3\u00A2\u00E2\u0082\u00AC\u00E2\u0080\u009D/g, '-')
    .replace(/\u00E2\u0080\u0094/g, '-')
    .replace(/\u00E2\u0080\u0093/g, '-')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/\s+to\s+/gi, ' - ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingLocationFromDatesLine(value: string): string {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const match = extractDateRangeMatch(raw);
  if (match) return match.matchedText;
  return normalizeDateRangeSeparators(raw);
}

function canonicalizeDateRange(text: string): string {
  const normalized = stripLeadingLocationFromDatesLine(text);
  const match = extractDateRangeMatch(normalized);
  if (!match) return normalized;
  return `${match.start} – ${match.end}`.replace(/\s+/g, ' ').trim();
}

function splitCanonicalDateRangeText(value: string): { start_date?: string; end_date?: string } {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return {};
  const match = extractDateRangeMatch(text);
  if (match) {
    return { start_date: match.start, end_date: match.end };
  }
  const normalized = normalizeDateRangeSeparators(text);
  const parts = normalized.split(' - ').map((part) => String(part ?? '').trim()).filter(Boolean);
  if (parts.length === 1) {
    return { start_date: parts[0] };
  }
  return {};
}

function looksLikeDatesLine(value: string): boolean {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return false;
  const normalized = stripLeadingLocationFromDatesLine(raw);
  return Boolean(extractDateRangeMatch(normalized)) && normalized.split(/\s+/).length <= 12;
}

function looksLikeRoleTitle(value: string): boolean {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  return /\b(?:engineer|architect|administrator|sysadmin|developer|technician|specialist|founder|co-?founder|webmaster|assistant|manager|director|analyst|lead|program)\b/i.test(
    text,
  );
}

function isLikelyCompanyName(value: string): boolean {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (
    /\b(?:program\s+manager|project\s+manager|product\s+manager|support\s+operations|operations|customer\s+experience|customer\s+success|engineer|architect|administrator|sysadmin|developer|technician|specialist|founder|co-?founder|webmaster|assistant|manager|director|analyst|contractor|consultant|lead)\b/i.test(
      text,
    ) &&
    !/\b(?:inc|inc\.|llc|l\.l\.c\.|co|co\.|corp|corp\.|ltd|ltd\.|pllc|pllc\.)\b/i.test(text)
  ) {
    return false;
  }
  if (/\b(?:professional\s+experience|experience|project|projects|skills|education|summary)\b/i.test(text)) {
    return false;
  }
  if (
    /\b(?:automation\s*&\s*monitoring|datacenter\s+operations|internal\s+web\s+applications|internal\s+tooling\s*&\s+software\s+development|earlier\s+career)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  if (/\b(?:vue|react|angular|frontend|back\s*end|full[-\s]*stack|builder)\b/i.test(text)) {
    return false;
  }
  if (/^\p{Ll}[\s\S]*$/u.test(text) || /^[,;:)\-]/.test(text) || /[,:;]\s*$/.test(text)) {
    return false;
  }
  const openParens = (text.match(/\(/g) ?? []).length;
  const closeParens = (text.match(/\)/g) ?? []).length;
  if (openParens !== closeParens) return false;
  const stateSuffixMatch = text.match(
    /^(?:[A-Za-z][A-Za-z .'-]+),\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b\.?$/i,
  );
  const locationLike =
    Boolean(stateSuffixMatch) ||
    /^(?:Seattle|San Francisco|New York|Los Angeles|Austin|Chicago|Boston|Denver|Portland|Miami|Dallas|Houston|Phoenix|San Diego|San Jose)\b/i.test(
      text,
    );
  if (locationLike && text.split(/\s+/).length <= 4) return false;
  return true;
}

function parseCompanyWithDates(line: string): { company: string; dates?: string } | null {
  const raw = String(line ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const match = raw.match(/^(.+?)\s*\(([^()]*\b(19|20)\d{2}[^()]*)\)\s*$/);
  if (!match) return null;
  const company = String(match[1] ?? '').trim();
  const dates = String(match[2] ?? '').trim();
  if (!company) return null;
  return { company, ...(dates ? { dates } : {}) };
}

function parseCompanyWithInlineDates(line: string): { company: string; dates: string } | null {
  const raw = String(line ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  const normalized = normalizeDateRangeSeparators(raw);
  const match = extractDateRangeMatch(normalized);
  if (!match) return null;

  const company = String(normalized.slice(0, normalized.indexOf(match.matchedText))).replace(/[\s|@-]+$/g, ' ').replace(/\s+/g, ' ').trim();
  if (!company || !isLikelyCompanyName(company)) return null;

  return { company, dates: canonicalizeDateRange(match.matchedText) };
}

function parseCompanyWithTrailingStartDate(line: string): { company: string; start: string } | null {
  const raw = String(line ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const match = raw.match(new RegExp(`^(.*?)(?:\\s+)(${MONTH_YEAR_TOKEN})\\s*$`, 'i'));
  if (!match) return null;
  const company = String(match[1] ?? '').trim();
  const start = String(match[2] ?? '').trim();
  if (!company || !start) return null;
  return { company, start };
}

function parseRoleAtCompany(line: string): { company: string; roleTitle: string; dates?: string } | null {
  const raw = String(line ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const match = raw.match(/^(.+?)\s+at\s+(.+?)(?:\s*\(([^()]*)\))?\s*$/i);
  if (!match) return null;
  const roleTitle = String(match[1] ?? '').trim();
  const company = String(match[2] ?? '').trim();
  const dates = String(match[3] ?? '').trim();
  if (!roleTitle || !company) return null;
  return { company, roleTitle, ...(dates ? { dates } : {}) };
}

function isTextBulletLine(line: string): boolean {
  const text = String(line ?? '').replace(/\s+/g, ' ').trim();
  return /^[-•*]\s+/.test(text);
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
      const dates = String(entry.dates ?? '').trim();
      const splitDates = dates ? splitCanonicalDateRangeText(dates) : {};
      if (!dates || !splitDates.start_date || !splitDates.end_date) return null;
      const evidence = bullets.map((text, evidenceIndex) => ({
        id: `ingestion-structured-experience-${index}-evidence-${evidenceIndex}`,
        text,
        metrics: [] as Array<{ type: 'percentage' | 'currency' | 'count'; value: string }>,
        tags: [role.toLowerCase()],
      }));
      return {
        company,
        role,
        ...(splitDates.start_date ? { start_date: splitDates.start_date } : {}),
        ...(splitDates.end_date ? { end_date: splitDates.end_date } : {}),
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
      const trace = this.buildUploadTrace(rawText, parsedSections);
      const canonical = this.buildCanonical(rawText, parsedSections, trace);
      trace.canonicalParsedBaseline = {
        experienceType: Array.isArray(canonical.experience) ? 'array' : typeof canonical.experience,
        experienceCount: Array.isArray(canonical.experience) ? canonical.experience.length : 0,
        thematicFieldsPresent: Boolean(
          canonical.people_leadership ||
            canonical.operational_ownership ||
            canonical.tooling_and_platforms ||
            canonical.cross_functional_partnership ||
            canonical.customer_advocacy ||
            canonical.scale_and_scope ||
            canonical.metrics_and_outcomes ||
            canonical.skills_and_tools,
        ),
      } as any;
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
      return { rawText, parsedSections, canonical, sourceFormat, trace };
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
    const trace = this.buildUploadTrace(rawText, parsedSections);
    const canonical = this.buildCanonical(rawText, parsedSections, trace);
    trace.canonicalParsedBaseline = {
      experienceType: Array.isArray(canonical.experience) ? 'array' : typeof canonical.experience,
      experienceCount: Array.isArray(canonical.experience) ? canonical.experience.length : 0,
      thematicFieldsPresent: Boolean(
        canonical.people_leadership ||
          canonical.operational_ownership ||
          canonical.tooling_and_platforms ||
          canonical.cross_functional_partnership ||
          canonical.customer_advocacy ||
          canonical.scale_and_scope ||
          canonical.metrics_and_outcomes ||
          canonical.skills_and_tools,
      ),
    } as any;
    return { rawText, parsedSections, canonical, sourceFormat, trace };
  }

  private buildUploadTrace(
    rawText: string,
    parsedSections: ParsedSection[],
    canonical?: BaselineSchemaCoreShape,
  ): BaselineUploadTrace {
    const text = String(rawText ?? '');
    return {
      extractedText: {
        textLength: text.length,
        workHistoryHeadingDetected: /^(experience|professional experience|work experience)\b/im.test(text),
        dateRangeCount: (text.match(DATE_RANGE_GLOBAL_RE) ?? []).length,
      },
      parserOutput: {
        sectionTypes: parsedSections.map((section) => String((section as any)?.sectionType ?? 'UNKNOWN')),
        experienceSectionCount: parsedSections.filter(
          (section) => String((section as any)?.sectionType ?? '').toUpperCase() === 'EXPERIENCE',
        ).length,
        otherSectionCount: parsedSections.filter(
          (section) => String((section as any)?.sectionType ?? '').toUpperCase() === 'OTHER',
        ).length,
      },
      ...(canonical
        ? {
            canonicalParsedBaseline: {
              experienceType: Array.isArray(canonical.experience) ? 'array' : typeof canonical.experience,
              experienceCount: Array.isArray(canonical.experience) ? canonical.experience.length : 0,
              thematicFieldsPresent: Boolean(
                canonical.people_leadership ||
                  canonical.operational_ownership ||
                  canonical.tooling_and_platforms ||
                  canonical.cross_functional_partnership ||
                  canonical.customer_advocacy ||
                  canonical.scale_and_scope ||
                  canonical.metrics_and_outcomes ||
                  canonical.skills_and_tools,
              ),
            } as any,
          }
        : {}),
    };
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
    trace?: BaselineUploadTrace,
  ): BaselineSchemaCoreShape {
    const context: ParsingContext = {
      missingFields: [],
      ambiguityFlags: [],
      lowConfidence: [],
    };
    const experience = this.buildExperience(parsedSections, context, trace);
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
    trace?: BaselineUploadTrace,
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
    if (trace) {
      trace.baselineIngestion = {
        candidateBlockCount: blocks.length,
        mappedExperienceCount: 0,
        rejectedBlockCount: 0,
        rejectionReasons: [],
      };
    }
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
    const experience = blocks.flatMap((block) => this.parseExperienceBlock(block, context, trace));
    if (trace?.baselineIngestion) {
      trace.baselineIngestion.mappedExperienceCount = experience.length;
      trace.baselineIngestion.rejectedBlockCount = Math.max(0, blocks.length - experience.length);
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
    const structured = extractStructuredBaselineFromSections(promotedSections as any, { includeDiagnostics: true });
    if (trace) {
      const diagnostics = (structured as any)?.diagnostics ?? {};
      trace.structuredBaselineExtractor = {
        candidateHeaderCount: Array.isArray(diagnostics.detectedExperienceHeaders)
          ? diagnostics.detectedExperienceHeaders.length
          : 0,
        structuredExperienceCount: Array.isArray((structured as any)?.experience) ? (structured as any).experience.length : 0,
        unsafeHeaderRejectionCount: Array.isArray(diagnostics.rejectedExperienceHeaders)
          ? diagnostics.rejectedExperienceHeaders.length
          : 0,
        rejectionReasons: Array.isArray(diagnostics.rejectedExperienceHeaders)
          ? Array.from(
              new Set(
                diagnostics.rejectedExperienceHeaders
                  .map((entry: any) => String(entry?.reason ?? '').trim())
                  .filter(Boolean),
              ),
            )
          : [],
      };
    }
    if (experience.length > 0) {
      return experience;
    }
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

    for (let idx = 0; idx < lines.length; ) {
      const line = lines[idx];
      if (isStandaloneSectionHeadingLine(line)) {
        flushCurrentBlock();
        idx += 1;
        continue;
      }
      const headerRead = this.readExperienceHeaderAt(lines, idx);
      const isHeaderLine = Boolean(headerRead);

      if (isHeaderLine) {
        flushCurrentBlock();
        currentBlock.push(
          ...lines.slice(idx, idx + (headerRead?.consumed ?? 1)).map((item) => item.trim()).filter(Boolean),
        );
        idx += headerRead?.consumed ?? 1;
        continue;
      }

      if (currentBlock.length > 0) {
        currentBlock.push(line);
      }
      idx += 1;
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

  private parseExperienceBlock(
    block: string,
    context: ParsingContext,
    trace?: BaselineUploadTrace,
  ): BaselineSchemaCoreShape['experience'] {
    const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return [];
    const headerRead = this.readExperienceHeaderAt(lines, 0);
    if (!headerRead) {
      context.missingFields.push('experience.company_or_role');
      if (trace?.baselineIngestion) trace.baselineIngestion.rejectionReasons.push('experience.company_or_role');
      return [];
    }
    const parsedHeader = headerRead.header;
    if (!parsedHeader.company || !parsedHeader.role) {
      context.missingFields.push('experience.company_or_role');
      if (trace?.baselineIngestion) trace.baselineIngestion.rejectionReasons.push('experience.company_or_role');
      return [];
    }
    if (!parsedHeader.start || !parsedHeader.end) {
      context.missingFields.push('experience.date_range');
      if (trace?.baselineIngestion) trace.baselineIngestion.rejectionReasons.push('experience.date_range');
      return [];
    }
    if (isContactLikeText(parsedHeader.company) || isContactLikeText(parsedHeader.role)) {
      context.missingFields.push('experience.company_or_role');
      if (trace?.baselineIngestion) trace.baselineIngestion.rejectionReasons.push('experience.company_or_role');
      return [];
    }
    const role = parsedHeader.role;
    if (!role) {
      context.missingFields.push('experience.company_or_role');
      if (trace?.baselineIngestion) trace.baselineIngestion.rejectionReasons.push('experience.company_or_role');
      return [];
    }
    const body = lines.slice(headerRead.consumed);
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
      if (trace?.baselineIngestion) trace.baselineIngestion.rejectionReasons.push('experience.bullets');
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

  private readExperienceHeaderAt(
    lines: string[],
    startIndex: number,
  ): { header: { company: string; role: string; start: string | null; end: string | null }; consumed: number } | null {
    const line0 = String(lines[startIndex] ?? '').trim();
    if (!line0) return null;

    const headerCandidate0 = line0;
    if (isStandaloneSectionHeadingLine(headerCandidate0)) return null;
    if (isContactLikeText(headerCandidate0)) return null;

    const line1 = String(lines[startIndex + 1] ?? '').trim();
    const line2 = String(lines[startIndex + 2] ?? '').trim();
    const line0LooksLikeCompany = isLikelyCompanyName(headerCandidate0);
    const line0LooksLikeRole = looksLikeRoleTitle(headerCandidate0);
    const line1LooksLikeCompany = isLikelyCompanyName(line1);

    if (line1 && !isTextBulletLine(line1)) {
      const inlineDates = parseCompanyWithInlineDates(headerCandidate0);
      if (inlineDates && looksLikeRoleTitle(line1)) {
        const splitDates = splitCanonicalDateRangeText(inlineDates.dates);
        if (splitDates.start_date && splitDates.end_date) {
          return {
            header: {
              company: inlineDates.company,
              role: line1,
              start: splitDates.start_date ?? null,
              end: splitDates.end_date ?? null,
            },
            consumed: 2,
          };
        }
      }

      if (line0LooksLikeCompany && looksLikeRoleTitle(line1)) {
        const line2Dates = line2 && !isTextBulletLine(line2) && looksLikeDatesLine(line2) ? canonicalizeDateRange(line2) : null;
        const splitDates = line2Dates ? splitCanonicalDateRangeText(line2Dates) : {};
        if (splitDates.start_date && splitDates.end_date) {
          return {
            header: {
              company: headerCandidate0,
              role: line1,
              start: splitDates.start_date ?? null,
              end: splitDates.end_date ?? null,
            },
            consumed: 3,
          };
        }
      }

      if (line0LooksLikeCompany && looksLikeDatesLine(line1) && line2 && !isTextBulletLine(line2) && looksLikeRoleTitle(line2)) {
        const splitDates = splitCanonicalDateRangeText(canonicalizeDateRange(line1));
        if (splitDates.start_date && splitDates.end_date) {
          return {
            header: {
              company: headerCandidate0,
              role: line2,
              start: splitDates.start_date ?? null,
              end: splitDates.end_date ?? null,
            },
            consumed: 3,
          };
        }
      }

      if ((!line0LooksLikeCompany || line0LooksLikeRole) && line1LooksLikeCompany && line2 && !isTextBulletLine(line2) && looksLikeDatesLine(line2)) {
        const splitDates = splitCanonicalDateRangeText(canonicalizeDateRange(line2));
        if (splitDates.start_date && splitDates.end_date) {
          return {
            header: {
              company: line1,
              role: headerCandidate0,
              start: splitDates.start_date ?? null,
              end: splitDates.end_date ?? null,
            },
            consumed: 3,
          };
        }
      }
    }

    const single = this.parseExperienceHeader(headerCandidate0);
    if (single.company && single.role) {
      const companyLooksLikeRole = looksLikeRoleTitle(single.company);
      const roleLooksLikeCompany = isLikelyCompanyName(single.role);
      if ((!isLikelyCompanyName(single.company) && roleLooksLikeCompany) || (companyLooksLikeRole && roleLooksLikeCompany)) {
        const swapped = { company: single.role, role: single.company, start: single.start, end: single.end };
        if (line1 && !looksLikeDatesLine(line1) && !isTextBulletLine(line1)) {
          const companyWithDates = parseCompanyWithDates(headerCandidate0);
          if (companyWithDates) {
            const splitDates = companyWithDates.dates
              ? splitCanonicalDateRangeText(companyWithDates.dates)
              : {};
            return {
              header: {
                company: companyWithDates.company,
                role: line1,
                start: splitDates.start_date ?? single.start,
                end: splitDates.end_date ?? single.end,
              },
              consumed: 2,
            };
          }
        }
        const line1Dates = line1 && looksLikeDatesLine(line1) ? canonicalizeDateRange(line1) : null;
        const splitDates = line1Dates ? splitCanonicalDateRangeText(line1Dates) : {};
        return {
          header: {
            company: swapped.company,
            role: swapped.role,
            start: splitDates.start_date ?? swapped.start,
            end: splitDates.end_date ?? swapped.end,
          },
          consumed: line1Dates ? 2 : 1,
        };
      }

      if (line1 && !isTextBulletLine(line1) && looksLikeDatesLine(line1)) {
        const splitDates = splitCanonicalDateRangeText(canonicalizeDateRange(line1));
        return {
          header: {
            company: single.company,
            role: single.role,
            start: splitDates.start_date ?? single.start,
            end: splitDates.end_date ?? single.end,
          },
          consumed: 2,
        };
      }
      return {
        header: {
          company: single.company,
          role: single.role,
          start: single.start,
          end: single.end,
        },
        consumed: 1,
      };
    }

    if (looksLikeDatesLine(line0)) return null;

    const firstWord = headerCandidate0.split(/\s+/)[0]?.toLowerCase() ?? '';
    const startsWithActionVerb = new Set([
      'designed',
      'built',
      'led',
      'managed',
      'created',
      'implemented',
      'developed',
      'owned',
      'improved',
      'reduced',
      'increased',
      'delivered',
      'supported',
      'maintained',
      'coordinated',
      'partnered',
      'collaborated',
      'architected',
      'automated',
      'migrated',
      'troubleshot',
      'resolved',
    ]).has(firstWord);
    const looksLikeSentence = /[.!?]\s*$/.test(headerCandidate0) || (/[.!?]/.test(headerCandidate0) && headerCandidate0.split(/\s+/).length > 6);
    if (startsWithActionVerb || looksLikeSentence) {
      return null;
    }

    if (line1 && !isTextBulletLine(line1)) {
      const inlineDates = parseCompanyWithInlineDates(headerCandidate0);
      if (inlineDates) {
        const splitDates = splitCanonicalDateRangeText(inlineDates.dates);
        return {
          header: { company: inlineDates.company, role: line1, start: splitDates.start_date ?? null, end: splitDates.end_date ?? null },
          consumed: 2,
        };
      }

      const monthYearOnly = MONTH_YEAR_RE;
      if (looksLikeDatesLine(line1) || monthYearOnly.test(line1)) {
        const trailingStart = parseCompanyWithTrailingStartDate(headerCandidate0);
        if (trailingStart && line2 && !isTextBulletLine(line2) && !looksLikeDatesLine(line2)) {
          const splitDates = splitCanonicalDateRangeText(canonicalizeDateRange(`${trailingStart.start} - ${line1}`));
          return {
            header: {
              company: trailingStart.company,
              role: line2,
              start: splitDates.start_date ?? trailingStart.start,
              end: splitDates.end_date ?? null,
            },
            consumed: 3,
          };
        }
      }

      const companyWithDates = parseCompanyWithDates(headerCandidate0);
      if (companyWithDates) {
        const line1LooksLikeRole = looksLikeRoleTitle(line1);
        if (line1LooksLikeRole) {
          const splitDates = companyWithDates.dates
            ? splitCanonicalDateRangeText(companyWithDates.dates)
            : {};
          return {
            header: {
              company: companyWithDates.company,
              role: line1,
              start: splitDates.start_date ?? single.start,
              end: splitDates.end_date ?? single.end,
            },
            consumed: 2,
          };
        }
      }

      const maybeDates = line2 && !isTextBulletLine(line2) && looksLikeDatesLine(line2) ? canonicalizeDateRange(line2) : null;
      const splitMaybeDates = maybeDates ? splitCanonicalDateRangeText(maybeDates) : {};
      if ((!line0LooksLikeCompany || line0LooksLikeRole) && line1LooksLikeCompany) {
        return {
          header: {
            company: line1,
            role: headerCandidate0,
            start: splitMaybeDates.start_date ?? null,
            end: splitMaybeDates.end_date ?? null,
          },
          consumed: maybeDates ? 3 : 2,
        };
      }

      if (line0LooksLikeCompany && looksLikeRoleTitle(line1)) {
        return {
          header: {
            company: headerCandidate0,
            role: line1,
            start: splitMaybeDates.start_date ?? null,
            end: splitMaybeDates.end_date ?? null,
          },
          consumed: maybeDates ? 3 : 2,
        };
      }
    }

    return null;
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
        Boolean(extractDateRangeMatch(text)) ||
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
    const dateMatch = extractDateRangeMatch(normalized);
    const stripped = dateMatch ? normalized.replace(dateMatch.matchedText, ' ') : normalized;
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
    const match = extractDateRangeMatch(section);
    if (!match) return { start: null, end: null };
    return { start: match.start, end: match.end.toLowerCase() === 'present' ? 'present' : match.end };
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
