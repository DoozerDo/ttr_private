import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessCode } from '../access-codes/access-code.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Application } from '../applications/application.entity';
import { BetaFeedback } from '../beta-feedback/beta-feedback.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
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
  resultsImprovementModuleViews: number;
  resultsImprovementCtaClicks: number;
  artifactUsedIntents: number;
  artifactRefineIntents: number;
  opportunityCommitIntents: number;
  resultsImprovementCtaRate: number;
  artifactToOpportunityCommitRate: number;
  refineIntentShare: number;
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

type BetaUserStateSummary =
  | 'Invited, not activated'
  | 'Logged in, no analysis'
  | 'Analysis complete, no generation'
  | 'Limited generation, unresolved'
  | 'Generated docs'
  | 'Submitted bug report';

type BetaUserRosterRow = {
  userId: string;
  email: string;
  accessCodeStatus: 'none' | 'assigned' | 'redeemed' | 'revoked';
  firstLoginAt: string | null;
  lastActiveAt: string | null;
  analysesRun: number;
  studioVisits: number;
  documentGenerations: number;
  bugReportsSubmitted: number;
  currentStateSummary: BetaUserStateSummary;
};

type CommandCenterSummary = {
  invited: number;
  activated: number;
  loggedIn: number;
  ranFirstAnalysis: number;
  reachedResults: number;
  openedStudio: number;
  generatedResume: number;
  generatedCoverLetter: number;
  submittedBug: number;
  trackedApplication: number;
};

type CommandCenterHotspot = {
  key: string;
  label: string;
  count: number;
  examples: string[];
};

type CommandCenterActionItem = {
  key: string;
  label: string;
  count: number;
  users: string[];
};

type BetaCommandCenterResponse = {
  generatedAt: string;
  roster: BetaUserRosterRow[];
  funnel: CommandCenterSummary;
  frictionHotspots: CommandCenterHotspot[];
  bugFeed: Array<{
    id: string;
    title: string;
    severity: string;
    category: string;
    where: string;
    createdAt: string;
    userEmail: string | null;
    status: 'open';
    issueUrl: string | null;
  }>;
  actionNeededQueue: CommandCenterActionItem[];
};

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsEventRepository: Repository<AnalyticsEvent>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(AccessCode)
    private readonly accessCodeRepository: Repository<AccessCode>,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
    @InjectRepository(BetaFeedback)
    private readonly betaFeedbackRepository: Repository<BetaFeedback>,
  ) {}

  async getBetaCommandCenter(input?: {
    includeSynthetic?: boolean;
  }): Promise<BetaCommandCenterResponse> {
    const includeSynthetic = input?.includeSynthetic ?? false;
    const [users, accessCodes, events, assessments, opportunities, applications, feedback] =
      await Promise.all([
        this.usersRepository.find({
          where: includeSynthetic
            ? { role: 'user' }
            : { role: 'user', isSynthetic: false },
          select: ['id', 'email', 'createdAt'],
          order: { createdAt: 'DESC' },
        }),
        this.accessCodeRepository.find({
          select: ['assignedUserId', 'redeemedByUserId', 'redeemedAt', 'revokedAt', 'createdAt'],
          order: { createdAt: 'DESC' },
        }),
        this.analyticsEventRepository.find({
          where: includeSynthetic ? {} : { isSynthetic: false },
          select: ['userId', 'eventName', 'createdAt', 'properties'],
          order: { createdAt: 'DESC' },
          take: 5000,
        }),
        this.fitAssessmentRepository.find({
          where: includeSynthetic ? {} : { isSynthetic: false },
          select: ['id', 'userId', 'createdAt'],
          order: { createdAt: 'DESC' },
        }),
        this.opportunityRepository.find({
          where: includeSynthetic ? {} : { isSynthetic: false },
          select: ['id', 'userId', 'status', 'updatedAt'],
          order: { updatedAt: 'DESC' },
        }),
        this.applicationRepository.find({
          where: includeSynthetic ? {} : { isSynthetic: false },
          select: ['id', 'userId', 'createdAt'],
          order: { createdAt: 'DESC' },
        }),
        this.betaFeedbackRepository.find({
          where: includeSynthetic ? {} : { isSynthetic: false },
          select: ['id', 'title', 'severity', 'category', 'where', 'createdAt', 'userId'],
          order: { createdAt: 'DESC' },
          take: 200,
        }),
      ]);

    const userEmailById = new Map(users.map((user) => [user.id, user.email]));

    const accessStatusByUser = new Map<string, BetaUserRosterRow['accessCodeStatus']>();
    for (const code of accessCodes) {
      const assigned = code.assignedUserId ?? null;
      const redeemed = code.redeemedByUserId ?? null;
      if (assigned) {
        const current = accessStatusByUser.get(assigned) ?? 'none';
        if (code.revokedAt) accessStatusByUser.set(assigned, 'revoked');
        else if (current !== 'redeemed') accessStatusByUser.set(assigned, 'assigned');
      }
      if (redeemed) {
        accessStatusByUser.set(redeemed, 'redeemed');
      }
    }

    const byUser = new Map<
      string,
      {
        firstLoginAt: Date | null;
        lastActiveAt: Date | null;
        studioVisits: number;
        resumeGenerated: number;
        coverGenerated: number;
        limitedGeneration: number;
        analysisReachedResults: number;
      }
    >();
    const ensureUser = (userId: string) => {
      const existing = byUser.get(userId);
      if (existing) return existing;
      const seed = {
        firstLoginAt: null,
        lastActiveAt: null,
        studioVisits: 0,
        resumeGenerated: 0,
        coverGenerated: 0,
        limitedGeneration: 0,
        analysisReachedResults: 0,
      };
      byUser.set(userId, seed);
      return seed;
    };

    for (const event of events) {
      const userId = event.userId?.trim();
      if (!userId) continue;
      const bucket = ensureUser(userId);
      if (!bucket.firstLoginAt || event.createdAt < bucket.firstLoginAt) {
        bucket.firstLoginAt = event.createdAt;
      }
      if (!bucket.lastActiveAt || event.createdAt > bucket.lastActiveAt) {
        bucket.lastActiveAt = event.createdAt;
      }
      if (event.eventName === 'resume_studio_opened') bucket.studioVisits += 1;
      if (event.eventName === 'resume_generation_succeeded') bucket.resumeGenerated += 1;
      if (event.eventName === 'cover_letter_generation_succeeded') bucket.coverGenerated += 1;
      if (
        event.eventName === 'resume_generation_limited' ||
        event.eventName === 'cover_letter_generation_limited' ||
        event.eventName === 'resume_generation_blocked_compliance' ||
        event.eventName === 'cover_letter_generation_blocked_compliance'
      ) {
        bucket.limitedGeneration += 1;
      }
      if (event.eventName === 'role_analysis_completed') {
        bucket.analysisReachedResults += 1;
      }
    }

    const analysisCountByUser = new Map<string, number>();
    for (const assessment of assessments) {
      analysisCountByUser.set(
        assessment.userId,
        (analysisCountByUser.get(assessment.userId) ?? 0) + 1,
      );
    }

    const appCountByUser = new Map<string, number>();
    for (const application of applications) {
      appCountByUser.set(
        application.userId,
        (appCountByUser.get(application.userId) ?? 0) + 1,
      );
    }

    const bugCountByUser = new Map<string, number>();
    for (const bug of feedback) {
      const userId = bug.userId?.trim();
      if (!userId) continue;
      bugCountByUser.set(userId, (bugCountByUser.get(userId) ?? 0) + 1);
    }

    const roster: BetaUserRosterRow[] = users.map((user) => {
      const telemetry = byUser.get(user.id);
      const analysesRun = analysisCountByUser.get(user.id) ?? 0;
      const studioVisits = telemetry?.studioVisits ?? 0;
      const generatedResume = telemetry?.resumeGenerated ?? 0;
      const generatedCover = telemetry?.coverGenerated ?? 0;
      const bugReportsSubmitted = bugCountByUser.get(user.id) ?? 0;
      const documentGenerations = generatedResume + generatedCover;
      const limitedGeneration = telemetry?.limitedGeneration ?? 0;
      let currentStateSummary: BetaUserStateSummary = 'Invited, not activated';
      if ((telemetry?.firstLoginAt ?? null) && analysesRun === 0) {
        currentStateSummary = 'Logged in, no analysis';
      } else if (analysesRun > 0 && documentGenerations === 0 && limitedGeneration > 0) {
        currentStateSummary = 'Limited generation, unresolved';
      } else if (analysesRun > 0 && documentGenerations === 0) {
        currentStateSummary = 'Analysis complete, no generation';
      } else if (documentGenerations > 0) {
        currentStateSummary = 'Generated docs';
      }
      if (bugReportsSubmitted > 0) {
        currentStateSummary = 'Submitted bug report';
      }
      return {
        userId: user.id,
        email: user.email ?? 'Unknown',
        accessCodeStatus: accessStatusByUser.get(user.id) ?? 'none',
        firstLoginAt: telemetry?.firstLoginAt?.toISOString() ?? null,
        lastActiveAt: telemetry?.lastActiveAt?.toISOString() ?? null,
        analysesRun,
        studioVisits,
        documentGenerations,
        bugReportsSubmitted,
        currentStateSummary,
      };
    });

    const uniqueInvitedUsers = new Set<string>();
    accessCodes.forEach((code) => {
      if (code.assignedUserId) uniqueInvitedUsers.add(code.assignedUserId);
      if (code.redeemedByUserId) uniqueInvitedUsers.add(code.redeemedByUserId);
    });

    const funnel: CommandCenterSummary = {
      invited: Math.max(uniqueInvitedUsers.size, roster.length),
      activated: roster.filter((row) => row.accessCodeStatus === 'redeemed').length,
      loggedIn: roster.filter((row) => row.firstLoginAt !== null).length,
      ranFirstAnalysis: roster.filter((row) => row.analysesRun > 0).length,
      reachedResults: roster.filter((row) => (byUser.get(row.userId)?.analysisReachedResults ?? 0) > 0).length,
      openedStudio: roster.filter((row) => row.studioVisits > 0).length,
      generatedResume: roster.filter((row) => (byUser.get(row.userId)?.resumeGenerated ?? 0) > 0).length,
      generatedCoverLetter: roster.filter((row) => (byUser.get(row.userId)?.coverGenerated ?? 0) > 0).length,
      submittedBug: roster.filter((row) => row.bugReportsSubmitted > 0).length,
      trackedApplication: roster.filter((row) => (appCountByUser.get(row.userId) ?? 0) > 0).length,
    };

    const limitedUsers = roster.filter((row) => (byUser.get(row.userId)?.limitedGeneration ?? 0) > 0);
    const missingCoverageFeedback = feedback.filter((item) =>
      item.title.toLowerCase().includes('missing') ||
      item.category === 'data_missing' ||
      item.category === 'ux_confusion',
    );
    const complianceBlockedUsers = events.filter(
      (event) =>
        event.eventName === 'resume_generation_blocked_compliance' ||
        event.eventName === 'cover_letter_generation_blocked_compliance',
    );
    const analysisLoadFailures = events.filter((event) => event.eventName === 'analysis_load_failed');
    const loginFailuresFromFeedback = feedback.filter((item) =>
      item.title.toLowerCase().includes('login') || item.where.toLowerCase().includes('login'),
    );

    const frictionHotspots: CommandCenterHotspot[] = [
      {
        key: 'login_failures',
        label: 'Login failures',
        count: loginFailuresFromFeedback.length,
        examples: loginFailuresFromFeedback.slice(0, 3).map((item) => item.title),
      },
      {
        key: 'limited_generation',
        label: 'Limited generation counts',
        count: limitedUsers.length,
        examples: limitedUsers.slice(0, 3).map((row) => row.email),
      },
      {
        key: 'missing_verification_coverage',
        label: 'Missing verification coverage',
        count: missingCoverageFeedback.length,
        examples: missingCoverageFeedback.slice(0, 3).map((item) => item.title),
      },
      {
        key: 'generation_blocked_compliance',
        label: 'Generation blocked by compliance',
        count: complianceBlockedUsers.length,
        examples: complianceBlockedUsers.slice(0, 3).map((event) => event.userId ?? 'unknown user'),
      },
      {
        key: 'source_resume_or_version_issues',
        label: 'Source resume/version issues',
        count: feedback.filter((item) => item.category === 'formatting_resume').length,
        examples: feedback
          .filter((item) => item.category === 'formatting_resume')
          .slice(0, 3)
          .map((item) => item.title),
      },
      {
        key: 'analysis_load_failures',
        label: 'Analysis load failures',
        count: analysisLoadFailures.length,
        examples: analysisLoadFailures.slice(0, 3).map((event) => event.userId ?? 'unknown user'),
      },
    ];

    const actionNeededQueue: CommandCenterActionItem[] = [
      {
        key: 'never_activated_after_invite',
        label: 'Users who never activated after invite',
        count: roster.filter((row) => row.accessCodeStatus === 'assigned').length,
        users: roster
          .filter((row) => row.accessCodeStatus === 'assigned')
          .slice(0, 8)
          .map((row) => row.email),
      },
      {
        key: 'limited_generation_and_stopped',
        label: 'Users who hit limited generation and stopped',
        count: roster.filter(
          (row) =>
            (byUser.get(row.userId)?.limitedGeneration ?? 0) > 0 &&
            row.documentGenerations === 0,
        ).length,
        users: roster
          .filter(
            (row) =>
              (byUser.get(row.userId)?.limitedGeneration ?? 0) > 0 &&
              row.documentGenerations === 0,
          )
          .slice(0, 8)
          .map((row) => row.email),
      },
      {
        key: 'multiple_bug_reports',
        label: 'Users who submitted multiple bug reports',
        count: roster.filter((row) => row.bugReportsSubmitted >= 2).length,
        users: roster
          .filter((row) => row.bugReportsSubmitted >= 2)
          .slice(0, 8)
          .map((row) => row.email),
      },
      {
        key: 'generated_but_not_tracked_application',
        label: 'Users who generated docs but never tracked an application',
        count: roster.filter(
          (row) => row.documentGenerations > 0 && (appCountByUser.get(row.userId) ?? 0) === 0,
        ).length,
        users: roster
          .filter(
            (row) => row.documentGenerations > 0 && (appCountByUser.get(row.userId) ?? 0) === 0,
          )
          .slice(0, 8)
          .map((row) => row.email),
      },
    ];

    return {
      generatedAt: new Date().toISOString(),
      roster,
      funnel,
      frictionHotspots,
      bugFeed: feedback.slice(0, 40).map((item) => ({
        id: item.id,
        title: item.title,
        severity: item.severity,
        category: item.category,
        where: item.where,
        createdAt: item.createdAt.toISOString(),
        userEmail: item.userId ? userEmailById.get(item.userId) ?? null : null,
        status: 'open',
        issueUrl: null,
      })),
      actionNeededQueue,
    };
  }

  async ingestEvent(dto: TrackAnalyticsEventDto) {
    const properties = this.normalizeProperties(dto.eventName, dto.properties);
    const createdAt = this.resolveCreatedAt(dto.createdAt);

    const event = this.analyticsEventRepository.create({
      eventName: dto.eventName,
      sessionId: dto.sessionId.trim(),
      userId: dto.userId?.trim() || null,
      path: dto.path?.trim() || null,
      properties,
      isSynthetic: dto.isSynthetic ?? false,
      syntheticScenarioKey: dto.syntheticScenarioKey?.trim() || null,
      syntheticRunId: dto.syntheticRunId?.trim() || null,
      createdAt,
    });

    return this.analyticsEventRepository.save(event);
  }

  async getSummary(
    days = 30,
    options?: { includeSynthetic?: boolean },
  ): Promise<AnalyticsSummaryResponse> {
    const normalizedDays = Number.isFinite(days)
      ? Math.max(1, Math.min(365, Math.floor(days)))
      : 30;
    const since = new Date(Date.now() - normalizedDays * 24 * 60 * 60 * 1000);
    const includeSynthetic = options?.includeSynthetic ?? false;

    const [
      visitorRow,
      startsRow,
      completionsRow,
      opportunitiesRow,
      resumeOpensRow,
      heroDemoCompletionsRow,
      resultsImprovementModuleViewsRow,
      resultsImprovementCtaClicksRow,
      artifactUsedIntentsRow,
      artifactRefineIntentsRow,
      opportunityCommitIntentsRow,
      scoreRows,
    ] = await Promise.all([
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(DISTINCT event.sessionId)', 'count')
        .where('event.eventName = :eventName', { eventName: 'landing_viewed' })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
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
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
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
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', { eventName: 'opportunity_saved' })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
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
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'results_improvement_module_viewed',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'results_improvement_cta_clicked',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'artifact_used_intent',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'artifact_refine_intent',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'opportunity_commit_intent',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawOne<{ count: string }>(),
      this.analyticsEventRepository
        .createQueryBuilder('event')
        .select('COUNT(*)', 'count')
        .where('event.eventName = :eventName', {
          eventName: 'compatibility_analysis_completed',
        })
        .andWhere('event.createdAt >= :since', { since })
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
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
        .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
        .getRawMany<{ properties: Record<string, unknown> | string }>(),
    ]);

    const visitors = Number(visitorRow?.count ?? 0);
    const analysisStarts = Number(startsRow?.count ?? 0);
    const analysisCompletions = Number(completionsRow?.count ?? 0);
    const opportunitiesSaved = Number(opportunitiesRow?.count ?? 0);
    const resumeStudioOpens = Number(resumeOpensRow?.count ?? 0);
    const heroDemoCompletions = Number(heroDemoCompletionsRow?.count ?? 0);
    const resultsImprovementModuleViews = Number(resultsImprovementModuleViewsRow?.count ?? 0);
    const resultsImprovementCtaClicks = Number(resultsImprovementCtaClicksRow?.count ?? 0);
    const artifactUsedIntents = Number(artifactUsedIntentsRow?.count ?? 0);
    const artifactRefineIntents = Number(artifactRefineIntentsRow?.count ?? 0);
    const opportunityCommitIntents = Number(opportunityCommitIntentsRow?.count ?? 0);

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
    const resultsImprovementCtaRate = toRate(resultsImprovementCtaClicks, resultsImprovementModuleViews);
    const artifactToOpportunityCommitRate = toRate(opportunityCommitIntents, artifactUsedIntents);
    const refineIntentShare = toRate(
      artifactRefineIntents,
      artifactRefineIntents + opportunityCommitIntents,
    );

    return {
      visitors,
      analysisStarts,
      analysisCompletions,
      opportunitiesSaved,
      resumeStudioOpens,
      heroDemoCompletions,
      resultsImprovementModuleViews,
      resultsImprovementCtaClicks,
      artifactUsedIntents,
      artifactRefineIntents,
      opportunityCommitIntents,
      resultsImprovementCtaRate,
      artifactToOpportunityCommitRate,
      refineIntentShare,
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
    includeSynthetic?: boolean;
  }): Promise<FounderMetricsResponse> {
    const now = new Date();
    const rangeKey = input?.rangeKey ?? '7d';
    const includeSynthetic = input?.includeSynthetic ?? false;
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
          .where(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
          .getRawOne<{ minCreatedAt: Date | string | null }>(),
        this.usersRepository
          .createQueryBuilder('user')
          .select('MIN(user.createdAt)', 'minCreatedAt')
          .where(includeSynthetic ? '1=1' : 'user.isSynthetic = false')
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
      .andWhere(includeSynthetic ? '1=1' : 'event.isSynthetic = false')
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
      .andWhere(includeSynthetic ? '1=1' : 'user.isSynthetic = false')
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

