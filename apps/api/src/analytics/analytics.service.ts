import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEvent } from './analytics-event.entity';
import type { TrackAnalyticsEventDto } from './dto/track-analytics-event.dto';
import {
  ANALYTICS_SCORE_BUCKETS,
  ANALYTICS_SCROLL_DEPTHS,
  resolveScoreBucket,
  type AnalyticsScoreBucket,
} from './analytics.constants';

type AnalyticsSummaryStep =
  | 'landing_viewed'
  | 'role_analysis_started'
  | 'role_analysis_completed'
  | 'opportunity_saved'
  | 'resume_studio_opened';

type AnalyticsSummaryResponse = {
  visitors: number;
  analysisStarts: number;
  analysisCompletions: number;
  opportunitiesSaved: number;
  resumeStudioOpens: number;
  heroDemoCompletions: number;
  startRate: number;
  completionRate: number;
  opportunitySaveRate: number;
  resumeOpenRate: number;
  scoreDistribution: Record<AnalyticsScoreBucket, number>;
  funnel: Array<{ eventName: AnalyticsSummaryStep; count: number }>;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toRate(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function normalizeScoreBucket(value: unknown): AnalyticsScoreBucket | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim() as AnalyticsScoreBucket;
  return ANALYTICS_SCORE_BUCKETS.includes(normalized) ? normalized : null;
}

function normalizeAllowedString(
  value: unknown,
  allowed: readonly string[],
): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : null;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsEventRepository: Repository<AnalyticsEvent>,
  ) {}

  async ingestEvent(dto: TrackAnalyticsEventDto) {
    const properties = this.normalizeProperties(dto.eventName, dto.properties);
    const createdAt = this.resolveCreatedAt(dto.createdAt);

    const event = this.analyticsEventRepository.create({
      eventName: dto.eventName,
      sessionId: dto.sessionId.trim(),
      userId: dto.userId?.trim() || null,
      path: dto.path?.trim() || null,
      properties,
      createdAt,
    });

    return this.analyticsEventRepository.save(event);
  }

  async getSummary(days = 30): Promise<AnalyticsSummaryResponse> {
    const normalizedDays = Number.isFinite(days)
      ? Math.max(1, Math.min(365, Math.floor(days)))
      : 30;
    const since = new Date(Date.now() - normalizedDays * 24 * 60 * 60 * 1000);

    const [
      visitorRow,
      startsRow,
      completionsRow,
      opportunitiesRow,
      resumeOpensRow,
      heroDemoCompletionsRow,
      scoreRows,
    ] = await Promise.all([
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(DISTINCT event.sessionId)', 'count')
        .where('event.eventName = :eventName', { eventName: 'landing_viewed' })
        .andWhere('event.createdAt >= :since', { since })
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(DISTINCT event.sessionId)', 'count')
        .where('event.eventName IN (:...eventNames)', {
          eventNames: ['compatibility_analysis_started', 'role_analysis_started'],
        })
        .andWhere("event.properties ->> 'source' = :source", {
          source: 'landing',
        })
        .andWhere('event.createdAt >= :since', { since })
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'role_analysis_completed',
        })
        .andWhere(
          "(event.properties ->> 'source' = :resultsSource OR event.properties ->> 'source' = :unknownSource)",
          {
            resultsSource: 'results',
            unknownSource: 'unknown',
          },
        )
        .andWhere('event.createdAt >= :since', { since })
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', { eventName: 'opportunity_saved' })
        .andWhere('event.createdAt >= :since', { since })
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'resume_studio_opened',
        })
        .andWhere("event.properties ->> 'entrySource' = :entrySource", {
          entrySource: 'results',
        })
        .andWhere('event.createdAt >= :since', { since })
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'compatibility_analysis_completed',
        })
        .andWhere('event.createdAt >= :since', { since })
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('event.properties', 'properties')
        .where('event.eventName = :eventName', {
          eventName: 'role_analysis_completed',
        })
        .andWhere(
          "(event.properties ->> 'source' = :resultsSource OR event.properties ->> 'source' = :unknownSource)",
          {
            resultsSource: 'results',
            unknownSource: 'unknown',
          },
        )
        .andWhere('event.createdAt >= :since', { since })
        .getRawMany<{ properties: Record<string, unknown> | string }>(),
    ]);

    const visitors = Number(visitorRow?.count ?? 0);
    const analysisStarts = Number(startsRow?.count ?? 0);
    const analysisCompletions = Number(completionsRow?.count ?? 0);
    const opportunitiesSaved = Number(opportunitiesRow?.count ?? 0);
    const resumeStudioOpens = Number(resumeOpensRow?.count ?? 0);
    const heroDemoCompletions = Number(heroDemoCompletionsRow?.count ?? 0);

    const scoreDistribution: Record<AnalyticsScoreBucket, number> = {
      under_60: 0,
      '60s': 0,
      '70s': 0,
      '80s': 0,
      '90_plus': 0,
    };

    for (const row of scoreRows) {
      let rawProperties: Record<string, unknown> | null = null;
      if (typeof row.properties === 'string') {
        try {
          rawProperties = JSON.parse(row.properties) as Record<string, unknown>;
        } catch {
          rawProperties = null;
        }
      } else if (row.properties && typeof row.properties === 'object') {
        rawProperties = row.properties as Record<string, unknown>;
      }
      if (!rawProperties || typeof rawProperties !== 'object') {
        continue;
      }

      const bucketFromPayload = normalizeScoreBucket(rawProperties.scoreBucket);
      const score = toFiniteNumber(rawProperties.score);
      const bucket = bucketFromPayload ?? (score !== null ? resolveScoreBucket(score) : null);
      if (!bucket) continue;
      scoreDistribution[bucket] += 1;
    }

    const startRate = toRate(analysisStarts, visitors);
    const completionRate = toRate(analysisCompletions, analysisStarts);
    const opportunitySaveRate = toRate(opportunitiesSaved, analysisCompletions);
    const resumeOpenRate = toRate(resumeStudioOpens, analysisCompletions);

    return {
      visitors,
      analysisStarts,
      analysisCompletions,
      opportunitiesSaved,
      resumeStudioOpens,
      heroDemoCompletions,
      startRate,
      completionRate,
      opportunitySaveRate,
      resumeOpenRate,
      scoreDistribution,
      funnel: [
        { eventName: 'landing_viewed', count: visitors },
        { eventName: 'role_analysis_started', count: analysisStarts },
        { eventName: 'role_analysis_completed', count: analysisCompletions },
        { eventName: 'opportunity_saved', count: opportunitiesSaved },
        { eventName: 'resume_studio_opened', count: resumeStudioOpens },
      ],
    };
  }

  private resolveCreatedAt(value?: string): Date | undefined {
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('createdAt must be a valid ISO timestamp');
    }
    return date;
  }

  private normalizeProperties(
    eventName: string,
    input?: Record<string, unknown>,
  ): Record<string, unknown> {
    const properties: Record<string, unknown> = { ...(input ?? {}) };

    if (eventName === 'scroll_depth_reached') {
      const depth = toFiniteNumber(properties.depthPercent);
      if (depth === null) {
        throw new BadRequestException(
          'scroll_depth_reached requires numeric depthPercent',
        );
      }
      const rounded = Math.round(depth);
      if (!ANALYTICS_SCROLL_DEPTHS.includes(rounded as 25 | 50 | 75 | 100)) {
        throw new BadRequestException(
          'depthPercent must be one of 25, 50, 75, or 100',
        );
      }
      properties.depthPercent = rounded;
    }

    if (
      eventName === 'resume_upload_initiated' ||
      eventName === 'resume_upload_completed' ||
      eventName === 'job_description_focused'
    ) {
      const source = normalizeAllowedString(properties.source, ['landing', 'unknown']);
      if (!source) {
        throw new BadRequestException(
          `${eventName} requires source: landing|unknown`,
        );
      }
      properties.source = source;
    }

    if (eventName === 'role_analysis_started' || eventName === 'compatibility_analysis_started') {
      const source = normalizeAllowedString(properties.source, [
        'landing',
        'app',
        'unknown',
      ]);
      if (!source) {
        throw new BadRequestException(
          `${eventName} requires source: landing|app|unknown`,
        );
      }
      properties.source = source;
    }

    if (eventName === 'compatibility_analysis_completed') {
      const source = normalizeAllowedString(properties.source, [
        'landing',
        'unknown',
      ]);
      if (!source) {
        throw new BadRequestException(
          'compatibility_analysis_completed requires source: landing|unknown',
        );
      }
      properties.source = source;
    }

    if (eventName === 'role_analysis_completed') {
      const source = normalizeAllowedString(properties.source, [
        'results',
        'unknown',
      ]);
      if (!source) {
        throw new BadRequestException(
          'role_analysis_completed requires source: results|unknown',
        );
      }
      properties.source = source;
    }

    if (eventName === 'opportunity_saved') {
      const source = normalizeAllowedString(properties.source, [
        'results',
        'workspace',
        'unknown',
      ]);
      if (!source) {
        throw new BadRequestException(
          'opportunity_saved requires source: results|workspace|unknown',
        );
      }
      properties.source = source;
    }

    if (eventName === 'resume_studio_opened') {
      const entrySource = normalizeAllowedString(properties.entrySource, [
        'results',
        'nav',
        'direct',
        'unknown',
      ]);
      if (!entrySource) {
        throw new BadRequestException(
          'resume_studio_opened requires entrySource: results|nav|direct|unknown',
        );
      }
      properties.entrySource = entrySource;
    }

    const score = toFiniteNumber(properties.score);
    const bucket = normalizeScoreBucket(properties.scoreBucket);
    if (score !== null && !bucket) {
      properties.scoreBucket = resolveScoreBucket(score);
    }

    return properties;
  }
}
