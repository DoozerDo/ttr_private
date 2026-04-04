import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { AnalyticsEvent } from '../analytics/analytics-event.entity';
import { Baseline } from '../baseline/baseline.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { User } from '../users/user.entity';

export const CANONICAL_FUNNEL_STEPS = [
  'user_created',
  'baseline_started',
  'baseline_completed',
  'first_analysis_completed',
  'low_score_detected',
  'baseline_updated_after_low_score',
  'reanalysis_completed',
  'high_score_achieved',
  'opportunity_created',
  'documents_generated',
] as const;

export type FunnelStepName = (typeof CANONICAL_FUNNEL_STEPS)[number];

export type UserFunnelSteps = Record<FunnelStepName, Date | null>;

export type UserFunnelState = {
  userId: string;
  email: string;
  mostRecentScore: number | null;
  analysisCount: number;
  lastActivityAt: Date | null;
  steps: UserFunnelSteps;
  currentStep: FunnelStepName;
  completedSteps: FunnelStepName[];
};

type FunnelMetrics = {
  totalUsers: number;
  stepCounts: Record<FunnelStepName, number>;
  conversionRates: {
    baseline_started_to_completed: number;
    completed_to_first_analysis: number;
    analysis_to_high_score: number;
    high_score_to_opportunity: number;
    opportunity_to_documents: number;
  };
  dropOffRates: Record<FunnelStepName, number>;
};

type TimeMetrics = {
  avgTimeToBaselineComplete: number;
  avgTimeToFirstAnalysis: number;
  avgTimeToReanalysis: number;
  avgTimeToHighScore: number;
  avgTimeToOpportunity: number;
};

type RecoveryMetrics = {
  usersWithLowScore: number;
  usersWhoRecovered: number;
  recoveryRate: number;
  avgTimeToRecovery: number;
};

type SegmentBreakdown = {
  scoreBucket: Record<'lt_70' | 'between_70_84' | 'gte_85' | 'unknown', number>;
  baselineCompletenessAtFirstAnalysis: Record<'complete' | 'incomplete_or_missing', number>;
  analysisCount: Record<'one' | 'two_plus', number>;
};

export type FunnelMetricsResponse = {
  funnel: FunnelMetrics;
  time: TimeMetrics;
  recovery: RecoveryMetrics;
};

function toHours(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function firstDate(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  return dates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

function firstDateAfter(dates: Date[], after: Date | null): Date | null {
  if (!after) return firstDate(dates);
  return firstDate(dates.filter((entry) => entry.getTime() > after.getTime()));
}

function firstDateOnOrAfter(dates: Date[], after: Date | null): Date | null {
  if (!after) return firstDate(dates);
  return firstDate(dates.filter((entry) => entry.getTime() >= after.getTime()));
}

@Injectable()
export class FunnelMetricsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(FitAssessment)
    private readonly assessmentRepository: Repository<FitAssessment>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsRepository: Repository<AnalyticsEvent>,
  ) {}

  async listUserFunnelStates(options?: {
    includeSynthetic?: boolean;
  }): Promise<UserFunnelState[]> {
    const includeSynthetic = options?.includeSynthetic ?? false;
    const [users, baselines, assessments, opportunities, events] = await Promise.all([
      this.userRepository.find({
        where: includeSynthetic ? { role: 'user' } : { role: 'user', isSynthetic: false },
        select: ['id', 'email', 'createdAt'],
      }),
      this.baselineRepository.find({
        where: includeSynthetic ? {} : { isSynthetic: false },
        select: ['id', 'userId', 'createdAt', 'updatedAt', 'latestBaselineScore', 'originalBaselineScore', 'firstAnalyzedAt'],
      }),
      this.assessmentRepository.find({
        where: includeSynthetic ? {} : { isSynthetic: false },
        select: ['id', 'userId', 'jobId', 'overallScore', 'createdAt'],
      }),
      this.opportunityRepository.find({
        where: includeSynthetic ? {} : { isSynthetic: false },
        select: ['id', 'userId', 'dateCreated'],
      }),
      this.analyticsRepository.find({
        select: ['userId', 'eventName', 'createdAt'],
        where: includeSynthetic ? {} : { isSynthetic: false },
        order: { createdAt: 'ASC' },
        take: 20000,
      }),
    ]);

    const baselinesByUser = new Map<string, Baseline[]>();
    const assessmentsByUser = new Map<string, FitAssessment[]>();
    const opportunitiesByUser = new Map<string, Opportunity[]>();
    const eventsByUser = new Map<string, AnalyticsEvent[]>();

    for (const row of baselines) {
      const list = baselinesByUser.get(row.userId) ?? [];
      list.push(row);
      baselinesByUser.set(row.userId, list);
    }
    for (const row of assessments) {
      const list = assessmentsByUser.get(row.userId) ?? [];
      list.push(row);
      assessmentsByUser.set(row.userId, list);
    }
    for (const row of opportunities) {
      const list = opportunitiesByUser.get(row.userId) ?? [];
      list.push(row);
      opportunitiesByUser.set(row.userId, list);
    }
    for (const row of events) {
      if (!row.userId) continue;
      const list = eventsByUser.get(row.userId) ?? [];
      list.push(row);
      eventsByUser.set(row.userId, list);
    }

    return users.map((user) => {
      const userBaselines = (baselinesByUser.get(user.id) ?? []).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const userAssessments = (assessmentsByUser.get(user.id) ?? []).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const userOpportunities = (opportunitiesByUser.get(user.id) ?? []).sort((a, b) => a.dateCreated.getTime() - b.dateCreated.getTime());
      const userEvents = (eventsByUser.get(user.id) ?? []).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      const userCreated = user.createdAt;
      const baselineStarted = firstDate(userBaselines.map((entry) => entry.createdAt));
      const baselineCompleted = firstDate(
        userBaselines
          .filter((entry) => {
            const score = entry.originalBaselineScore ?? entry.latestBaselineScore ?? 0;
            return score >= 100;
          })
          .map((entry) => entry.updatedAt),
      );
      const firstAnalysis = firstDate(userAssessments.map((entry) => entry.createdAt));
      const lowScore = firstDate(userAssessments.filter((entry) => entry.overallScore < 70).map((entry) => entry.createdAt));
      const baselineUpdatedAfterLow = firstDateAfter(
        userBaselines.map((entry) => entry.updatedAt),
        lowScore,
      );
      const reanalysis = firstDateAfter(
        userAssessments.map((entry) => entry.createdAt),
        baselineUpdatedAfterLow,
      );
      const highScore = firstDateOnOrAfter(
        userAssessments.filter((entry) => entry.overallScore >= 70).map((entry) => entry.createdAt),
        reanalysis ?? firstAnalysis,
      );
      const opportunityCreated = firstDate(userOpportunities.map((entry) => entry.dateCreated));
      const documentsGenerated = firstDate(
        userEvents
          .filter(
            (entry) =>
              entry.eventName === 'resume_generation_succeeded' ||
              entry.eventName === 'cover_letter_generation_succeeded',
          )
          .map((entry) => entry.createdAt),
      );

      const steps: UserFunnelSteps = {
        user_created: userCreated,
        baseline_started: baselineStarted,
        baseline_completed: baselineCompleted,
        first_analysis_completed: firstAnalysis,
        low_score_detected: lowScore,
        baseline_updated_after_low_score: baselineUpdatedAfterLow,
        reanalysis_completed: reanalysis,
        high_score_achieved: highScore,
        opportunity_created: opportunityCreated,
        documents_generated: documentsGenerated,
      };

      const completedSteps = CANONICAL_FUNNEL_STEPS.filter((step) => steps[step] !== null);
      const currentStep = (completedSteps[completedSteps.length - 1] ?? 'user_created') as FunnelStepName;
      const lastActivityAt =
        [
          ...Object.values(steps).filter((value): value is Date => value instanceof Date),
        ].sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      const mostRecentScore = userAssessments[userAssessments.length - 1]?.overallScore ?? null;

      return {
        userId: user.id,
        email: user.email,
        mostRecentScore,
        analysisCount: userAssessments.length,
        lastActivityAt,
        steps,
        currentStep,
        completedSteps,
      };
    });
  }

  async getFunnelMetrics(options?: { includeSynthetic?: boolean }): Promise<FunnelMetricsResponse> {
    const states = await this.listUserFunnelStates(options);
    const totalUsers = states.length;
    const stepCounts = Object.fromEntries(
      CANONICAL_FUNNEL_STEPS.map((step) => [step, states.filter((state) => state.steps[step]).length]),
    ) as Record<FunnelStepName, number>;

    const dropOffRates = Object.fromEntries(
      CANONICAL_FUNNEL_STEPS.map((step) => [
        step,
        percent(states.filter((state) => state.currentStep === step).length, totalUsers),
      ]),
    ) as Record<FunnelStepName, number>;

    const conversionRates = {
      baseline_started_to_completed: percent(stepCounts.baseline_completed, stepCounts.baseline_started),
      completed_to_first_analysis: percent(stepCounts.first_analysis_completed, stepCounts.baseline_completed),
      analysis_to_high_score: percent(stepCounts.high_score_achieved, stepCounts.first_analysis_completed),
      high_score_to_opportunity: percent(stepCounts.opportunity_created, stepCounts.high_score_achieved),
      opportunity_to_documents: percent(stepCounts.documents_generated, stepCounts.opportunity_created),
    };

    const avgTimeToBaselineComplete = average(
      states
        .filter((state) => state.steps.baseline_started && state.steps.baseline_completed)
        .map((state) => toHours(state.steps.baseline_started as Date, state.steps.baseline_completed as Date)),
    );
    const avgTimeToFirstAnalysis = average(
      states
        .filter((state) => state.steps.baseline_completed && state.steps.first_analysis_completed)
        .map((state) => toHours(state.steps.baseline_completed as Date, state.steps.first_analysis_completed as Date)),
    );
    const avgTimeToReanalysis = average(
      states
        .filter((state) => state.steps.baseline_updated_after_low_score && state.steps.reanalysis_completed)
        .map((state) => toHours(state.steps.baseline_updated_after_low_score as Date, state.steps.reanalysis_completed as Date)),
    );
    const avgTimeToHighScore = average(
      states
        .filter((state) => state.steps.first_analysis_completed && state.steps.high_score_achieved)
        .map((state) => toHours(state.steps.first_analysis_completed as Date, state.steps.high_score_achieved as Date)),
    );
    const avgTimeToOpportunity = average(
      states
        .filter((state) => state.steps.high_score_achieved && state.steps.opportunity_created)
        .map((state) => toHours(state.steps.high_score_achieved as Date, state.steps.opportunity_created as Date)),
    );

    const usersWithLowScore = states.filter((state) => state.steps.low_score_detected).length;
    const recoveredStates = states.filter(
      (state) =>
        state.steps.low_score_detected &&
        state.steps.high_score_achieved &&
        (state.steps.high_score_achieved as Date).getTime() > (state.steps.low_score_detected as Date).getTime(),
    );
    const usersWhoRecovered = recoveredStates.length;
    const avgTimeToRecovery = average(
      recoveredStates.map((state) =>
        toHours(state.steps.low_score_detected as Date, state.steps.high_score_achieved as Date),
      ),
    );

    return {
      funnel: {
        totalUsers,
        stepCounts,
        conversionRates,
        dropOffRates,
      },
      time: {
        avgTimeToBaselineComplete,
        avgTimeToFirstAnalysis,
        avgTimeToReanalysis,
        avgTimeToHighScore,
        avgTimeToOpportunity,
      },
      recovery: {
        usersWithLowScore,
        usersWhoRecovered,
        recoveryRate: percent(usersWhoRecovered, usersWithLowScore),
        avgTimeToRecovery,
      },
    };
  }

  async getSegmentBreakdown(options?: { includeSynthetic?: boolean }): Promise<SegmentBreakdown> {
    const states = await this.listUserFunnelStates(options);
    const scoreBucket: SegmentBreakdown['scoreBucket'] = {
      lt_70: 0,
      between_70_84: 0,
      gte_85: 0,
      unknown: 0,
    };
    const baselineCompletenessAtFirstAnalysis: SegmentBreakdown['baselineCompletenessAtFirstAnalysis'] = {
      complete: 0,
      incomplete_or_missing: 0,
    };
    const analysisCount: SegmentBreakdown['analysisCount'] = { one: 0, two_plus: 0 };

    for (const state of states) {
      if (state.mostRecentScore == null) scoreBucket.unknown += 1;
      else if (state.mostRecentScore < 70) scoreBucket.lt_70 += 1;
      else if (state.mostRecentScore < 85) scoreBucket.between_70_84 += 1;
      else scoreBucket.gte_85 += 1;

      if (state.steps.first_analysis_completed && state.steps.baseline_completed) {
        if (
          (state.steps.baseline_completed as Date).getTime() <=
          (state.steps.first_analysis_completed as Date).getTime()
        ) {
          baselineCompletenessAtFirstAnalysis.complete += 1;
        } else {
          baselineCompletenessAtFirstAnalysis.incomplete_or_missing += 1;
        }
      } else {
        baselineCompletenessAtFirstAnalysis.incomplete_or_missing += 1;
      }

      if (state.analysisCount >= 2) analysisCount.two_plus += 1;
      else analysisCount.one += 1;
    }

    return {
      scoreBucket,
      baselineCompletenessAtFirstAnalysis,
      analysisCount,
    };
  }

  async getUsersForStep(
    stepName: FunnelStepName,
    options?: { includeSynthetic?: boolean },
  ): Promise<UserFunnelState[]> {
    const states = await this.listUserFunnelStates(options);
    return states.filter((state) => state.steps[stepName] || state.currentStep === stepName);
  }
}
