import { Injectable, Logger } from '@nestjs/common';
import type { Express } from 'express';
import path from 'node:path';
import { normalizeText } from '../scoring/fit-score/fit-score.utils';
import { extractJobToolRequirements } from '../scoring/fit-score/tool-extractor';
import {
  BaselineSectionType,
} from './baseline-section.entity';
import {
  BaselineSchemaCore,
  BaselineSchemaCoreShape,
} from './baseline-schema';
import {
  BaselineParserService,
  ParsedSection,
} from './baseline-parser.service';
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
  lowConfidence: Array<{
    path: string;
    reason: string;
    snippet: string;
  }>;
};

@Injectable()
export class BaselineIngestionService {
  private readonly logger = new Logger(BaselineIngestionService.name);

  constructor(
    private readonly baselineParser: BaselineParserService,
    private readonly baselineTextExtractor: BaselineTextExtractor,
    private readonly criticalFlowTrackerService: CriticalFlowTrackerService,
  ) {}

  async ingest(file: Express.Multer.File): Promise<BaselineIngestionResult> {
    try {
      const sourceFormat = this.detectFormat(file);
      const rawText = await this.baselineTextExtractor.extractText(file);
      const parsedSections = this.baselineParser.parseBaseline(rawText);

      const canonical = this.buildCanonical(rawText, parsedSections);

      this.logger.debug(
        `Baseline ingested (${sourceFormat}); missing_fields=${canonical.system_generated_read_only.missing_fields.length}`,
      );
      void this.criticalFlowTrackerService.recordCriticalFlowEvent({
        flow: CriticalFlowEventType.BASELINE_PARSED_SUCCESS,
        areaOrRoute: 'baseline',
      });

      return {
        rawText,
        parsedSections,
        canonical,
        sourceFormat,
      };
    } catch (error) {
      void this.criticalFlowTrackerService.recordCriticalFlowEvent({
        flow: CriticalFlowEventType.BASELINE_PARSED_FAILURE,
        areaOrRoute: 'baseline',
      });
      throw error;
    }
  }

  async ingestFromText(
    rawText: string,
    sourceFormat: BaselineSourceFormat,
  ): Promise<BaselineIngestionResult> {
    try {
      const parsedSections = this.baselineParser.parseBaseline(rawText);
      const canonical = this.buildCanonical(rawText, parsedSections);
      void this.criticalFlowTrackerService.recordCriticalFlowEvent({
        flow: CriticalFlowEventType.BASELINE_PARSED_SUCCESS,
        areaOrRoute: 'baseline',
      });

      return {
        rawText,
        parsedSections,
        canonical,
        sourceFormat,
      };
    } catch (error) {
      void this.criticalFlowTrackerService.recordCriticalFlowEvent({
        flow: CriticalFlowEventType.BASELINE_PARSED_FAILURE,
        areaOrRoute: 'baseline',
      });
      throw error;
    }
  }

  private detectFormat(file: Express.Multer.File): BaselineSourceFormat {
    const extension =
      path
        .extname(file.originalname || file.path || '')
        .toLowerCase() ?? '';
    if (extension === '.pdf') {
      return 'pdf';
    }
    return 'docx';
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
    const peopleLeadership = this.buildPeopleLeadership(normalized, context);
    const operationalOwnership = this.buildOperationalOwnership(
      normalized,
      context,
    );
    const crossFunctional = this.buildCrossFunctional(normalized);
    const customerAdvocacy = this.buildCustomerAdvocacy(normalized);
    const scaleAndScope = this.buildScaleAndScope(normalized);
    const metricsAndOutcomes = this.buildMetrics(normalized);
    const skillsAndTools = this.buildSkillsAndTools(normalized, tooling.tools);

    return BaselineSchemaCore.parse({
      identity,
      experience,
      people_leadership: peopleLeadership,
      operational_ownership: operationalOwnership,
      tooling_and_platforms: tooling,
      cross_functional_partnership: crossFunctional,
      customer_advocacy: customerAdvocacy,
      scale_and_scope: scaleAndScope,
      metrics_and_outcomes: metricsAndOutcomes,
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
    const lines = rawText
      .split(/\\r?\\n/)
      .map((line) => line.trim())
      .filter((line) => line);

    const headingTokens = new Set([
      'summary',
      'professional summary',
      'experience',
      'work experience',
      'skills',
      'education',
    ]);

    let fullName: string | null = null;

    for (const line of lines) {
      const normalized = line.toLowerCase().replace(/[:.]+$/, '').trim();
      if (headingTokens.has(normalized)) {
        continue;
      }
      if (/^\\d+$/.test(line)) {
        continue;
      }
      if (line.split(/\\s+/).length < 2) {
        continue;
      }
      fullName = line;
      context.lowConfidence.push({
        path: 'identity.full_name',
        reason: 'First non-heading line treated as full name',
        snippet: line.slice(0, 120),
      });
      break;
    }

    if (!fullName) {
      context.missingFields.push('identity.full_name');
      context.lowConfidence.push({
        path: 'identity.full_name',
        reason: 'Unable to locate a candidate full name line',
        snippet: lines.slice(0, 3).join(' '),
      });
    }

    const firstExperience = experience[0];

    return {
      full_name: fullName,
      current_title: firstExperience?.role_title ?? null,
      current_company: firstExperience?.company_name ?? null,
      location: this.extractLocation(rawText),
    };
  }

  private extractLocation(text: string): string | null {
    const match = text.match(/\\b(?:based in|location[:]?\\s*)([^\\n,]+)/i);
    if (match) {
      return match[1].trim();
    }
    return null;
  }

  private buildExperience(
    parsedSections: ParsedSection[],
    context: ParsingContext,
  ): BaselineSchemaCoreShape['experience'] {
    const experienceSections = parsedSections.filter(
      (section) => section.sectionType === BaselineSectionType.EXPERIENCE,
    );

    const blocks = experienceSections.flatMap((section) =>
      section.content
        .split(/\\n{2,}/)
        .map((segment) => segment.trim())
        .filter(Boolean),
    );

    if (!blocks.length) {
      context.missingFields.push('experience');
      return [];
    }

    const entries: BaselineSchemaCoreShape['experience'] = [];

    for (const block of blocks) {
      const parsed = this.parseExperienceBlock(block, context);
      if (parsed) {
        entries.push(parsed);
      }
    }

    return entries;
  }

  private parseExperienceBlock(
    block: string,
    context: ParsingContext,
  ): BaselineSchemaCoreShape['experience'][number] | null {
    const lines = block
      .split(/\\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      return null;
    }

    const header = lines[0];

    const [company, role] = this.splitCompanyAndRole(header);

    if (!company || !role) {
      context.missingFields.push('experience.company_or_role');
      return null;
    }

    const { start, end } = this.extractDates(header + ' ' + block);

    if (!start) {
      context.missingFields.push('experience.start_date');
    }

    const bodyLines = lines.slice(1);
    const scopeSummary =
      bodyLines
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ') || '';
    const detailsText = bodyLines.join('\n');

    return {
      company_name: company,
      role_title: role,
      start_date: start ?? null,
      end_date: end ?? null,
      scope_summary: scopeSummary,
      details_text: detailsText,
    };
  }

  private splitCompanyAndRole(header: string): [string | null, string | null] {
    const parts = header
      .split(/[-–—·•|]/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      const company = parts[0];
      const role = parts.slice(1).join(' ');
      return [company, role];
    }

    const atMatch = header.split('@').map((segment) => segment.trim());

    if (atMatch.length >= 2) {
      return [atMatch[0], atMatch.slice(1).join('@')];
    }

    return [null, null];
  }

  private extractDates(section: string) {
    const match =
      section.match(
        /(\\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+\\d{4}|\\d{4})\\s*(?:[-–—]|to)\\s*(present|\\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+\\d{4}|\\d{4})/i,
      );

    if (!match) {
      return { start: null, end: null };
    }

    return {
      start: match[1].trim(),
      end: match[2].toLowerCase() === 'present' ? 'present' : match[2].trim(),
    };
  }

  private buildPeopleLeadership(
    text: string,
    context: ParsingContext,
  ): BaselineSchemaCoreShape['people_leadership'] {
    const lower = text.toLowerCase();
    const directReportsMatch = lower.match(/managed\\s+(\\d+)\\s+(direct reports|people)/i);

    const directReports = directReportsMatch
      ? Number(directReportsMatch[1])
      : null;

    if (!directReports) {
      context.missingFields.push('people_leadership.direct_reports');
    }

    return {
      direct_reports: directReports,
      managers_led: /managed\\s+managers?/.test(lower) ? true : null,
      global_teams: /global\\s+teams?/.test(lower) ? true : null,
    };
  }

  private buildOperationalOwnership(
    text: string,
    context: ParsingContext,
  ): BaselineSchemaCoreShape['operational_ownership'] {
    const lower = text.toLowerCase();
    const functions = [
      'incident management',
      'problem management',
      'escalations',
      'tooling',
      'knowledge base',
      'qa',
    ].filter((keyword) => lower.includes(keyword));

    const processDesign = /process design/.test(lower) ? true : null;
    const processScaling =
      /(process scaling|scaled processes)/.test(lower) ? true : null;

    return {
      functions_owned: Array.from(new Set(functions)),
      process_design: processDesign,
      process_scaling: processScaling,
    };
  }

  private buildToolingAndSkills(
    text: string,
  ): BaselineSchemaCoreShape['tooling_and_platforms'] {
    const requirements = extractJobToolRequirements(text);
    const tools = [
      ...requirements.required,
      ...requirements.preferred,
    ].map((entry) => entry.toLowerCase());

    const ownershipLevel = this.detectOwnershipLevel(text);

    return {
      tools: Array.from(new Set(tools)),
      ownership_level: ownershipLevel,
    };
  }

  private detectOwnershipLevel(text: string): 'used' | 'administered' | 'owned' | 'implemented' | 'unknown' {
    const lower = text.toLowerCase();

    if (/(owned|owning)/.test(lower)) {
      return 'owned';
    }
    if (/administered/.test(lower)) {
      return 'administered';
    }
    if (/implemented/.test(lower)) {
      return 'implemented';
    }
    return 'unknown';
  }

  private buildCrossFunctional(
    text: string,
  ): BaselineSchemaCoreShape['cross_functional_partnership'] {
    const lower = text.toLowerCase();
    return {
      product: /product/.test(lower) ? true : null,
      engineering: /engineering/.test(lower) ? true : null,
      sales_cs:
        /(sales|customer success|cs)/.test(lower) ? true : null,
      executive: /(executive|c-level|c level)/.test(lower) ? true : null,
    };
  }

  private buildCustomerAdvocacy(
    text: string,
  ): BaselineSchemaCoreShape['customer_advocacy'] {
    const lower = text.toLowerCase();
    return {
      executive_escalations: /executive escalation/.test(lower)
        ? true
        : null,
      voice_of_customer: /voice of the customer|voc/.test(lower)
        ? true
        : null,
      post_incident_rca: /\b(rca|root cause analysis|post incident rca)\b/.test(lower)
        ? true
        : null,
    };
  }

  private buildScaleAndScope(
    text: string,
  ): BaselineSchemaCoreShape['scale_and_scope'] {
    const lower = text.toLowerCase();
    const customerSegment = lower.includes('smb')
      ? 'smb'
      : lower.includes('mid market') || lower.includes('mid-market')
      ? 'mid_market'
      : lower.includes('enterprise')
      ? 'enterprise'
      : 'unknown';
    const geoScope = lower.includes('global')
      ? 'global'
      : lower.includes('regional')
      ? 'regional'
      : 'unknown';
    const orgStage = lower.includes('public')
      ? 'public'
      : lower.includes('growth')
      ? 'growth'
      : lower.includes('early')
      ? 'early'
      : 'unknown';

    return {
      customer_segment: customerSegment,
      geo_scope: geoScope,
      org_stage: orgStage,
    };
  }

  private buildMetrics(text: string): BaselineSchemaCoreShape['metrics_and_outcomes'] {
    const lines = text.split(/\\n/);
    const metrics: string[] = [];

    for (const line of lines) {
      if (/\\d+/.test(line) && /(increase|improve|growth|revenue|percent|%)/i.test(line)) {
        metrics.push(line.trim());
      }
    }

    return {
      metrics_present: metrics.length > 0,
      metrics,
    };
  }

  private buildSkillsAndTools(
    text: string,
    toolingTools: string[],
  ): BaselineSchemaCoreShape['skills_and_tools'] {
    const lower = text.toLowerCase();
    const methodologies = [
      'agile',
      'scrum',
      'kanban',
      'itil',
      'devops',
      'waterfall',
      'lean',
    ].filter((keyword) => lower.includes(keyword));

    const domainCandidates = [
      { label: 'SaaS', pattern: /saas/ },
      { label: 'Enterprise IT', pattern: /enterprise it/ },
      { label: 'MSP', pattern: /msp/ },
      { label: 'Regulated', pattern: /regulated/ },
      { label: 'Internal Delivery', pattern: /internal delivery/ },
      { label: 'External Delivery', pattern: /external delivery/ },
    ]
      .filter((entry) => entry.pattern.test(lower))
      .map((entry) => entry.label);

    return {
      tools: Array.from(new Set(toolingTools)),
      methodologies: Array.from(new Set(methodologies)),
      domains: Array.from(new Set(domainCandidates)),
    };
  }
}
