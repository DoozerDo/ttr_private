import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEvent } from '../analytics/analytics-event.entity';
import { Baseline } from '../baseline/baseline.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { User } from '../users/user.entity';

export type UserEngagementState = {
  userId: string;
  email: string;
  lastActiveAt: Date | null;
  lastAnalysisAt: Date | null;
  lastBaselineUpdateAt: Date | null;
  lastOpportunityCreatedAt: Date | null;
  hasBaseline: boolean;
  baselineProgress: number | null;
  totalAnalyses: number;
  totalOpportunities: number;
  mostRecentScore: number | null;
  hasReanalysisAvailable: boolean;
  stateFlags: {
    invited_not_started: boolean;
    baseline_started_not_completed: boolean;
    analyzed_once_no_followup: boolean;
    low_score_no_action: boolean;
    reanalysis_available_not_used: boolean;
    high_score_not_applied: boolean;
    inactive_after_activity: boolean;
  };
};

type ThresholdConfig = {
  analyzedOnceNoFollowupHours: number;
  inactiveAfterActivityHours: number;
};

const DEFAULT_THRESHOLDS: ThresholdConfig = {
  analyzedOnceNoFollowupHours: 24,
  inactiveAfterActivityHours: 48,
};

function hoursAgo(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

@Injectable()
export class UserEngagementStateService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsEventRepository: Repository<AnalyticsEvent>,
  ) {}

  async listStates(config: Partial<ThresholdConfig> = {}): Promise<UserEngagementState[]> {
    const thresholds: ThresholdConfig = { ...DEFAULT_THRESHOLDS, ...config };
    const now = new Date();

    const [users, baselines, assessments, opportunities, events] = await Promise.all([
      this.userRepository.find({
        where: { role: 'user', isSynthetic: false },
        select: ['id', 'email', 'createdAt'],
      }),
      this.baselineRepository.find({
        where: { isSynthetic: false },
        select: ['id', 'userId', 'updatedAt', 'latestBaselineScore', 'firstAnalyzedAt'],
      }),
      this.fitAssessmentRepository.find({
        where: { isSynthetic: false },
        select: ['id', 'userId', 'overallScore', 'createdAt'],
      }),
      this.opportunityRepository.find({
        where: { isSynthetic: false },
        select: ['id', 'userId', 'dateCreated'],
      }),
      this.analyticsEventRepository.find({
        select: ['userId', 'eventName', 'createdAt'],
        where: { isSynthetic: false },
        order: { createdAt: 'DESC' },
        take: 10000,
      }),
    ]);

    const baselinesByUser = new Map<string, Baseline[]>();
    baselines.forEach((baseline) => {
      const bucket = baselinesByUser.get(baseline.userId) ?? [];
      bucket.push(baseline);
      baselinesByUser.set(baseline.userId, bucket);
    });

    const assessmentsByUser = new Map<string, FitAssessment[]>();
    assessments.forEach((assessment) => {
      const bucket = assessmentsByUser.get(assessment.userId) ?? [];
      bucket.push(assessment);
      assessmentsByUser.set(assessment.userId, bucket);
    });

    const opportunitiesByUser = new Map<string, Opportunity[]>();
    opportunities.forEach((opportunity) => {
      const bucket = opportunitiesByUser.get(opportunity.userId) ?? [];
      bucket.push(opportunity);
      opportunitiesByUser.set(opportunity.userId, bucket);
    });

    const eventsByUser = new Map<string, AnalyticsEvent[]>();
    events.forEach((event) => {
      const userId = event.userId?.trim();
      if (!userId) return;
      const bucket = eventsByUser.get(userId) ?? [];
      bucket.push(event);
      eventsByUser.set(userId, bucket);
    });

    return users.map((user) => {
      const userBaselines = (baselinesByUser.get(user.id) ?? []).sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      );
      const userAssessments = (assessmentsByUser.get(user.id) ?? []).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
      const userOpportunities = (opportunitiesByUser.get(user.id) ?? []).sort(
        (a, b) => b.dateCreated.getTime() - a.dateCreated.getTime(),
      );
      const userEvents = (eventsByUser.get(user.id) ?? []).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );

      const hasBaseline = userBaselines.length > 0;
      const latestBaseline = userBaselines[0] ?? null;
      const lastBaselineUpdateAt = latestBaseline?.updatedAt ?? null;
      const baselineProgress = !latestBaseline
        ? null
        : typeof latestBaseline.latestBaselineScore === 'number'
          ? clampPercent(latestBaseline.latestBaselineScore)
          : latestBaseline.firstAnalyzedAt
            ? 100
            : 50;

      const totalAnalyses = userAssessments.length;
      const totalOpportunities = userOpportunities.length;
      const lastAnalysisAt = userAssessments[0]?.createdAt ?? null;
      const mostRecentScore = userAssessments[0]?.overallScore ?? null;
      const lastOpportunityCreatedAt = userOpportunities[0]?.dateCreated ?? null;

      const eventLastActiveAt = userEvents[0]?.createdAt ?? null;
      const lastActiveAt = [eventLastActiveAt, lastAnalysisAt, lastBaselineUpdateAt, lastOpportunityCreatedAt]
        .filter((value): value is Date => value instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

      const hasReanalysisAvailable =
        Boolean(lastBaselineUpdateAt && lastAnalysisAt && lastBaselineUpdateAt.getTime() > lastAnalysisAt.getTime());
      const analysesAfterBaselineUpdate =
        lastBaselineUpdateAt == null
          ? 0
          : userAssessments.filter((entry) => entry.createdAt.getTime() > lastBaselineUpdateAt.getTime()).length;

      const analyzedOnceAgeHours = hoursAgo(lastAnalysisAt, now);
      const inactiveAgeHours = hoursAgo(lastActiveAt, now);
      const meaningfulActionBefore =
        hasBaseline ||
        totalAnalyses > 0 ||
        totalOpportunities > 0 ||
        userEvents.some((event) => event.eventName === 'resume_studio_opened');

      const lowScoreNoAction =
        typeof mostRecentScore === 'number' &&
        mostRecentScore < 70 &&
        totalAnalyses <= 1 &&
        !(lastBaselineUpdateAt && lastAnalysisAt && lastBaselineUpdateAt.getTime() > lastAnalysisAt.getTime());

      const stateFlags = {
        invited_not_started: !hasBaseline && totalAnalyses === 0,
        baseline_started_not_completed: hasBaseline && (baselineProgress ?? 0) < 100,
        analyzed_once_no_followup:
          totalAnalyses === 1 &&
          totalOpportunities === 0 &&
          (analyzedOnceAgeHours ?? 0) >= thresholds.analyzedOnceNoFollowupHours,
        low_score_no_action: lowScoreNoAction,
        reanalysis_available_not_used: hasReanalysisAvailable && analysesAfterBaselineUpdate === 0,
        high_score_not_applied:
          typeof mostRecentScore === 'number' &&
          mostRecentScore >= 70 &&
          totalOpportunities === 0,
        inactive_after_activity:
          meaningfulActionBefore && (inactiveAgeHours ?? 0) >= thresholds.inactiveAfterActivityHours,
      };

      return {
        userId: user.id,
        email: user.email,
        lastActiveAt,
        lastAnalysisAt,
        lastBaselineUpdateAt,
        lastOpportunityCreatedAt,
        hasBaseline,
        baselineProgress,
        totalAnalyses,
        totalOpportunities,
        mostRecentScore,
        hasReanalysisAvailable,
        stateFlags,
      };
    });
  }
}

