import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
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

type FounderFunnelStage = {
  label: 'Visitors' | 'Analyses Started' | 'Analyses Completed' | 'Accounts Created';
  count: number;
  conversionFromPrevious: number | null;
};

type FounderMetricsResponse = {
  range: {
    key: '7d' | '14d' | '30d' | 'all';
    days: number | null;
    granularity: 'day' | 'week';
    startAt: string;
    endAt: string;
  };
  lastUpdatedAt: string;
  funnel: FounderFunnelStage[];
  metrics: {
    visitorToAnalysisConversion: number;
    analysisCompletionRate: number;
    resultToAccountConversion: number;
    secondAnalysisRate: number;
    visitors: number;
    analysesStarted: number;
    analysesCompleted: number;
    accountsCreated: number;
    usersWithAtLeastOneAnalysis: number;
    usersWithTwoOrMoreAnalyses: number;
    averageAnalysesPerActiveUser: number;
  };
  previousPeriod: {
    visitorToAnalysisConversion: number;
    analysisCompletionRate: number;
    resultToAccountConversion: number;
    secondAnalysisRate: number;
    visitors: number;
    analysesStarted: number;
    analysesCompleted: number;
    accountsCreated: number;
  } | null;
  trends: {
    volume: Array<{
      bucketStart: string;
      bucketLabel: string;
      visitors: number;
      analysesStarted: number;
      analysesCompleted: number;
      accountsCreated: number;
    }>;
    conversion: Array<{
      bucketStart: string;
      bucketLabel: string;
      visitorToAnalysisConversion: number;
      analysisCompletionRate: number;
      resultToAccountConversion: number;
      secondAnalysisRate: number;
    }>;
  };
  supportingSignals: {
    resumeUploadRate: number;
    resumeUploads: number;
    sampleRoleUsage: number;
    averageTimeToFirstAnalysisSeconds: number;
  };
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

type FounderEventRow = {
  sessionId: string;
  userId: string | null;
  eventName: string;
  createdAtMs: number;
  analysisNumber: number | null;
};

type FounderWindowMetrics = {
  visitors: number;
  analysesStarted: number;
  analysesCompleted: number;
  accountsCreated: number;
  resumeUploads: number;
  sampleRoleUsage: number;
  averageTimeToFirstAnalysisSeconds: number;
  resumeUploadRate: number;
  usersWithAtLeastOneAnalysis: number;
  usersWithTwoOrMoreAnalyses: number;
  visitorToAnalysisConversion: number;
  analysisCompletionRate: number;
  resultToAccountConversion: number;
  secondAnalysisRate: number;
  averageAnalysesPerActiveUser: number;
};

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsEventRepository: Repository<AnalyticsEvent>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
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

  async getFounderMetrics(input?: {
    rangeKey?: '7d' | '14d' | '30d' | 'all';
  }): Promise<FounderMetricsResponse> {
    const now = new Date();
    const rangeKey = input?.rangeKey ?? '7d';
    const daysByRange: Record<'7d' | '14d' | '30d', number> = {
      '7d': 7,
      '14d': 14,
      '30d': 30,
    };

    let startAt: Date;
    if (rangeKey === 'all') {
      const [eventMinRow, userMinRow] = await Promise.all([
        this.analyticsEventRepository
          .createQueryBuilder('event')
          .select('MIN(event.createdAt)', 'minCreatedAt')
          .getRawOne<{ minCreatedAt: Date | string | null }>(),
        this.usersRepository
          .createQueryBuilder('user')
          .select('MIN(user.createdAt)', 'minCreatedAt')
          .getRawOne<{ minCreatedAt: Date | string | null }>(),
      ]);
      const minEventDate = eventMinRow?.minCreatedAt
        ? new Date(eventMinRow.minCreatedAt)
        : null;
      const minUserDate = userMinRow?.minCreatedAt
        ? new Date(userMinRow.minCreatedAt)
        : null;
      if (minEventDate && minUserDate) {
        startAt =
          minEventDate.getTime() <= minUserDate.getTime() ? minEventDate : minUserDate;
      } else if (minEventDate) {
        startAt = minEventDate;
      } else if (minUserDate) {
        startAt = minUserDate;
      } else {
        startAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
    } else {
      const days = daysByRange[rangeKey];
      startAt = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    const previousStartAt =
      rangeKey === 'all'
        ? null
        : new Date(startAt.getTime() - (now.getTime() - startAt.getTime()));

    const analyticsSince = previousStartAt ?? startAt;

    const trackedEventNames = [
      'landing_viewed',
      'landing_page_view',
      'compatibility_analysis_started',
      'role_analysis_started',
      'analysis_started',
      'compatibility_analysis_completed',
      'role_analysis_completed',
      'analysis_completed',
      'resume_upload_completed',
      'sample_role_clicked',
      'hero_example_chip_clicked',
    ] as const;

    const rawEvents = await this.analyticsEventRepository
      .createQueryBuilder('event')
      .select('event.sessionId', 'sessionId')
      .addSelect('event.userId', 'userId')
      .addSelect('event.eventName', 'eventName')
      .addSelect('event.createdAt', 'createdAt')
      .addSelect('event.properties', 'properties')
      .where('event.createdAt >= :since', { since: analyticsSince })
      .andWhere('event.eventName IN (:...eventNames)', {
        eventNames: trackedEventNames,
      })
      .getRawMany<{
        sessionId: string;
        userId: string | null;
        eventName: string;
        createdAt: Date | string;
        properties: Record<string, unknown> | string | null;
      }>();

    const normalizedEvents: FounderEventRow[] = [];
    for (const row of rawEvents) {
      const sessionId = row.sessionId?.trim();
      if (!sessionId) continue;

      const createdAtMs =
        row.createdAt instanceof Date
          ? row.createdAt.getTime()
          : new Date(row.createdAt).getTime();
      if (!Number.isFinite(createdAtMs)) continue;

      let analysisNumber: number | null = null;
      if (row.properties && typeof row.properties === 'object') {
        const maybeAnalysisNumber = toFiniteNumber(
          (row.properties as Record<string, unknown>).analysisNumber,
        );
        analysisNumber = maybeAnalysisNumber !== null ? Math.floor(maybeAnalysisNumber) : null;
      } else if (typeof row.properties === 'string') {
        try {
          const parsed = JSON.parse(row.properties) as Record<string, unknown>;
          const maybeAnalysisNumber = toFiniteNumber(parsed.analysisNumber);
          analysisNumber = maybeAnalysisNumber !== null ? Math.floor(maybeAnalysisNumber) : null;
        } catch {
          analysisNumber = null;
        }
      }

      normalizedEvents.push({
        sessionId,
        userId: row.userId?.trim() || null,
        eventName: row.eventName,
        createdAtMs,
        analysisNumber,
      });
    }

    const rawUsers = await this.usersRepository
      .createQueryBuilder('user')
      .select('user.createdAt', 'createdAt')
      .where('user.createdAt >= :since', { since: analyticsSince })
      .getRawMany<{ createdAt: Date | string }>();

    const userCreatedAtMs = rawUsers
      .map((row) =>
        row.createdAt instanceof Date
          ? row.createdAt.getTime()
          : new Date(row.createdAt).getTime(),
      )
      .filter((value) => Number.isFinite(value));

    const currentMetrics = this.computeFounderWindowMetrics(
      normalizedEvents,
      userCreatedAtMs,
      startAt.getTime(),
      now.getTime(),
    );

    const previousMetrics =
      previousStartAt !== null
        ? this.computeFounderWindowMetrics(
            normalizedEvents,
            userCreatedAtMs,
            previousStartAt.getTime(),
            startAt.getTime(),
          )
        : null;

    const granularity: 'day' | 'week' = rangeKey === 'all' ? 'week' : 'day';
    const trendWindows = this.buildTrendWindows(
      startAt.getTime(),
      now.getTime(),
      granularity,
    );

    const volumeTrend = trendWindows.map((window) => {
      const metrics = this.computeFounderWindowMetrics(
        normalizedEvents,
        userCreatedAtMs,
        window.startMs,
        window.endMs,
      );
      return {
        bucketStart: new Date(window.startMs).toISOString(),
        bucketLabel: window.label,
        visitors: metrics.visitors,
        analysesStarted: metrics.analysesStarted,
        analysesCompleted: metrics.analysesCompleted,
        accountsCreated: metrics.accountsCreated,
      };
    });

    const conversionTrend = trendWindows.map((window) => {
      const metrics = this.computeFounderWindowMetrics(
        normalizedEvents,
        userCreatedAtMs,
        window.startMs,
        window.endMs,
      );
      return {
        bucketStart: new Date(window.startMs).toISOString(),
        bucketLabel: window.label,
        visitorToAnalysisConversion: metrics.visitorToAnalysisConversion,
        analysisCompletionRate: metrics.analysisCompletionRate,
        resultToAccountConversion: metrics.resultToAccountConversion,
        secondAnalysisRate: metrics.secondAnalysisRate,
      };
    });

    const funnel: FounderFunnelStage[] = [
      {
        label: 'Visitors',
        count: currentMetrics.visitors,
        conversionFromPrevious: null,
      },
      {
        label: 'Analyses Started',
        count: currentMetrics.analysesStarted,
        conversionFromPrevious: currentMetrics.visitorToAnalysisConversion,
      },
      {
        label: 'Analyses Completed',
        count: currentMetrics.analysesCompleted,
        conversionFromPrevious: currentMetrics.analysisCompletionRate,
      },
      {
        label: 'Accounts Created',
        count: currentMetrics.accountsCreated,
        conversionFromPrevious: currentMetrics.resultToAccountConversion,
      },
    ];

    return {
      range: {
        key: rangeKey,
        days: rangeKey === 'all' ? null : daysByRange[rangeKey],
        granularity,
        startAt: startAt.toISOString(),
        endAt: now.toISOString(),
      },
      lastUpdatedAt: now.toISOString(),
      funnel,
      metrics: {
        visitorToAnalysisConversion: currentMetrics.visitorToAnalysisConversion,
        analysisCompletionRate: currentMetrics.analysisCompletionRate,
        resultToAccountConversion: currentMetrics.resultToAccountConversion,
        secondAnalysisRate: currentMetrics.secondAnalysisRate,
        visitors: currentMetrics.visitors,
        analysesStarted: currentMetrics.analysesStarted,
        analysesCompleted: currentMetrics.analysesCompleted,
        accountsCreated: currentMetrics.accountsCreated,
        usersWithAtLeastOneAnalysis: currentMetrics.usersWithAtLeastOneAnalysis,
        usersWithTwoOrMoreAnalyses: currentMetrics.usersWithTwoOrMoreAnalyses,
        averageAnalysesPerActiveUser: currentMetrics.averageAnalysesPerActiveUser,
      },
      previousPeriod:
        previousMetrics === null
          ? null
          : {
              visitorToAnalysisConversion: previousMetrics.visitorToAnalysisConversion,
              analysisCompletionRate: previousMetrics.analysisCompletionRate,
              resultToAccountConversion: previousMetrics.resultToAccountConversion,
              secondAnalysisRate: previousMetrics.secondAnalysisRate,
              visitors: previousMetrics.visitors,
              analysesStarted: previousMetrics.analysesStarted,
              analysesCompleted: previousMetrics.analysesCompleted,
              accountsCreated: previousMetrics.accountsCreated,
            },
      trends: {
        volume: volumeTrend,
        conversion: conversionTrend,
      },
      supportingSignals: {
        resumeUploadRate: currentMetrics.resumeUploadRate,
        resumeUploads: currentMetrics.resumeUploads,
        sampleRoleUsage: currentMetrics.sampleRoleUsage,
        averageTimeToFirstAnalysisSeconds:
          currentMetrics.averageTimeToFirstAnalysisSeconds,
      },
    };
  }

  private computeFounderWindowMetrics(
    events: FounderEventRow[],
    userCreatedAtMs: number[],
    startMs: number,
    endMs: number,
  ): FounderWindowMetrics {
    const landingEventNames = new Set(['landing_viewed', 'landing_page_view']);
    const analysisStartedEventNames = new Set([
      'compatibility_analysis_started',
      'role_analysis_started',
      'analysis_started',
    ]);
    const analysisCompletedEventNames = new Set([
      'compatibility_analysis_completed',
      'role_analysis_completed',
      'analysis_completed',
    ]);

    const visitorSessions = new Set<string>();
    const analysisStartedSessions = new Set<string>();
    const analysisCompletedSessions = new Set<string>();
    const resumeUploadSessions = new Set<string>();
    const analysisCountByActor = new Map<string, number>();

    const firstLandingAtBySession = new Map<string, number>();
    const firstAnalysisStartAtBySession = new Map<string, number>();
    let sampleRoleUsage = 0;

    for (const row of events) {
      if (row.createdAtMs < startMs || row.createdAtMs >= endMs) {
        continue;
      }
      if (landingEventNames.has(row.eventName)) {
        visitorSessions.add(row.sessionId);
        const previous = firstLandingAtBySession.get(row.sessionId);
        if (previous === undefined || row.createdAtMs < previous) {
          firstLandingAtBySession.set(row.sessionId, row.createdAtMs);
        }
      }
      if (analysisStartedEventNames.has(row.eventName)) {
        analysisStartedSessions.add(row.sessionId);
        const previous = firstAnalysisStartAtBySession.get(row.sessionId);
        if (previous === undefined || row.createdAtMs < previous) {
          firstAnalysisStartAtBySession.set(row.sessionId, row.createdAtMs);
        }
        const actorId = row.userId || row.sessionId;
        analysisCountByActor.set(actorId, (analysisCountByActor.get(actorId) ?? 0) + 1);
      }
      if (analysisCompletedEventNames.has(row.eventName)) {
        analysisCompletedSessions.add(row.sessionId);
      }
      if (row.eventName === 'resume_upload_completed') {
        resumeUploadSessions.add(row.sessionId);
      }
      if (
        row.eventName === 'sample_role_clicked' ||
        row.eventName === 'hero_example_chip_clicked'
      ) {
        sampleRoleUsage += 1;
      }
      if (
        row.eventName === 'compatibility_analysis_started' &&
        (row.analysisNumber ?? 0) > 1
      ) {
        sampleRoleUsage += 1;
      }
    }

    let totalTimeToFirstAnalysisSeconds = 0;
    let sessionsWithTiming = 0;
    for (const [sessionId, landingMs] of firstLandingAtBySession.entries()) {
      const analysisMs = firstAnalysisStartAtBySession.get(sessionId);
      if (analysisMs === undefined || analysisMs < landingMs) {
        continue;
      }
      totalTimeToFirstAnalysisSeconds += (analysisMs - landingMs) / 1000;
      sessionsWithTiming += 1;
    }

    const accountsCreated = userCreatedAtMs.filter(
      (value) => value >= startMs && value < endMs,
    ).length;
    const visitors = visitorSessions.size;
    const analysesStarted = analysisStartedSessions.size;
    const analysesCompleted = analysisCompletedSessions.size;
    const resumeUploads = resumeUploadSessions.size;
    const usersWithAtLeastOneAnalysis = analysisCountByActor.size;
    const usersWithTwoOrMoreAnalyses = Array.from(
      analysisCountByActor.values(),
    ).filter((count) => count >= 2).length;

    const visitorToAnalysisConversion = toRate(analysesStarted, visitors);
    const analysisCompletionRate = toRate(analysesCompleted, analysesStarted);
    const resultToAccountConversion = toRate(accountsCreated, analysesCompleted);
    const resumeUploadRate = toRate(resumeUploads, analysesStarted);
    const secondAnalysisRate = toRate(
      usersWithTwoOrMoreAnalyses,
      usersWithAtLeastOneAnalysis,
    );
    const averageAnalysesPerActiveUser =
      usersWithAtLeastOneAnalysis > 0
        ? Array.from(analysisCountByActor.values()).reduce(
            (sum, count) => sum + count,
            0,
          ) / usersWithAtLeastOneAnalysis
        : 0;

    return {
      visitors,
      analysesStarted,
      analysesCompleted,
      accountsCreated,
      resumeUploads,
      sampleRoleUsage,
      averageTimeToFirstAnalysisSeconds:
        sessionsWithTiming > 0
          ? totalTimeToFirstAnalysisSeconds / sessionsWithTiming
          : 0,
      resumeUploadRate,
      usersWithAtLeastOneAnalysis,
      usersWithTwoOrMoreAnalyses,
      visitorToAnalysisConversion,
      analysisCompletionRate,
      resultToAccountConversion,
      secondAnalysisRate,
      averageAnalysesPerActiveUser,
    };
  }

  private buildTrendWindows(
    startMs: number,
    endMs: number,
    granularity: 'day' | 'week',
  ): Array<{ startMs: number; endMs: number; label: string }> {
    const windows: Array<{ startMs: number; endMs: number; label: string }> = [];
    const stepMs = granularity === 'day'
      ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;

    let cursor = startMs;
    while (cursor < endMs) {
      const next = Math.min(endMs, cursor + stepMs);
      const date = new Date(cursor);
      const label =
        granularity === 'day'
          ? date.toISOString().slice(5, 10)
          : `${date.toISOString().slice(5, 10)} wk`;
      windows.push({ startMs: cursor, endMs: next, label });
      cursor = next;
    }

    return windows;
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
      if (eventName === 'compatibility_analysis_started') {
        const analysisNumber = toFiniteNumber(properties.analysisNumber);
        if (analysisNumber === null || analysisNumber < 1) {
          throw new BadRequestException(
            'compatibility_analysis_started requires numeric analysisNumber >= 1',
          );
        }
        properties.analysisNumber = Math.floor(analysisNumber);
      }
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
