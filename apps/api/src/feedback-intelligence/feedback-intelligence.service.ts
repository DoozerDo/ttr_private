import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEvent } from '../analytics/analytics-event.entity';
import { Baseline } from '../baseline/baseline.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { FeedbackCategory, FeedbackItem, FeedbackSeverity, FeedbackTriageStatus } from './feedback-item.entity';
import { FrictionEvent, FrictionEventType, FrictionResolutionStatus } from './friction-event.entity';

type CreateFeedbackInput = {
  userId: string;
  analysisId?: string | null;
  baselineId?: string | null;
  opportunityId?: string | null;
  category: FeedbackCategory;
  title: string;
  message: string;
  pageContext?: string | null;
  metadata?: Record<string, unknown> | null;
};

type UpdateFeedbackInput = Partial<
  Pick<
    FeedbackItem,
    'triageStatus' | 'severity' | 'adminNotes' | 'requiresFounderFollowup' | 'linkedIssueKey'
  >
>;

type UpdateFrictionInput = Partial<
  Pick<
    FrictionEvent,
    'resolutionStatus' | 'severity' | 'adminNotes' | 'requiresFounderFollowup' | 'linkedIssueKey'
  >
>;

@Injectable()
export class FeedbackIntelligenceService {
  constructor(
    @InjectRepository(FeedbackItem)
    private readonly feedbackRepository: Repository<FeedbackItem>,
    @InjectRepository(FrictionEvent)
    private readonly frictionRepository: Repository<FrictionEvent>,
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(FitAssessment)
    private readonly assessmentRepository: Repository<FitAssessment>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsRepository: Repository<AnalyticsEvent>,
  ) {}

  async createFeedback(input: CreateFeedbackInput): Promise<FeedbackItem> {
    const item = this.feedbackRepository.create({
      userId: input.userId,
      analysisId: input.analysisId ?? null,
      baselineId: input.baselineId ?? null,
      opportunityId: input.opportunityId ?? null,
      category: input.category,
      title: input.title.trim(),
      message: input.message.trim(),
      pageContext: input.pageContext?.trim() || null,
      metadata: input.metadata ?? null,
      triageStatus: FeedbackTriageStatus.NEW,
      severity: FeedbackSeverity.MEDIUM,
    });
    return this.feedbackRepository.save(item);
  }

  async listFeedback(filters?: {
    triageStatus?: FeedbackTriageStatus;
    severity?: FeedbackSeverity;
    category?: FeedbackCategory;
    pageContext?: string;
    unresolvedOnly?: boolean;
  }): Promise<FeedbackItem[]> {
    const query = this.feedbackRepository.createQueryBuilder('feedback').orderBy('feedback.createdAt', 'DESC');
    if (filters?.triageStatus) query.andWhere('feedback.triageStatus = :triageStatus', { triageStatus: filters.triageStatus });
    if (filters?.severity) query.andWhere('feedback.severity = :severity', { severity: filters.severity });
    if (filters?.category) query.andWhere('feedback.category = :category', { category: filters.category });
    if (filters?.pageContext) query.andWhere('feedback.pageContext = :pageContext', { pageContext: filters.pageContext });
    if (filters?.unresolvedOnly) query.andWhere('feedback.triageStatus IN (:...statuses)', { statuses: [FeedbackTriageStatus.NEW, FeedbackTriageStatus.REVIEWED, FeedbackTriageStatus.PLANNED] });
    return query.getMany();
  }

  async updateFeedback(id: string, patch: UpdateFeedbackInput) {
    await this.feedbackRepository.update({ id }, patch);
    return this.feedbackRepository.findOneBy({ id });
  }

  async listFrictionEvents(filters?: {
    resolutionStatus?: FrictionResolutionStatus;
    severity?: FeedbackSeverity;
    eventType?: FrictionEventType;
    unresolvedOnly?: boolean;
  }) {
    const events = await this.frictionRepository.find({ order: { createdAt: 'DESC' } });
    return Promise.all(events
      .filter((event) => !filters?.resolutionStatus || event.resolutionStatus === filters.resolutionStatus)
      .filter((event) => !filters?.severity || event.severity === filters.severity)
      .filter((event) => !filters?.eventType || event.eventType === filters.eventType)
      .filter((event) => !filters?.unresolvedOnly || event.resolutionStatus !== FrictionResolutionStatus.RESOLVED)
      .map(async (event) => ({ ...event, ...(await this.computeRecovery(event)) })));
  }

  async updateFrictionEvent(id: string, patch: UpdateFrictionInput) {
    const updatePayload: {
      resolutionStatus?: FrictionEvent['resolutionStatus'];
      severity?: FrictionEvent['severity'];
      adminNotes?: FrictionEvent['adminNotes'];
      requiresFounderFollowup?: FrictionEvent['requiresFounderFollowup'];
      linkedIssueKey?: FrictionEvent['linkedIssueKey'];
      resolvedAt?: Date | null;
    } = {
      resolutionStatus: patch.resolutionStatus,
      severity: patch.severity,
      adminNotes: patch.adminNotes,
      requiresFounderFollowup: patch.requiresFounderFollowup,
      linkedIssueKey: patch.linkedIssueKey,
    };
    if (patch.resolutionStatus === FrictionResolutionStatus.RESOLVED) {
      updatePayload.resolvedAt = new Date();
    }
    await this.frictionRepository.update({ id }, updatePayload);
    return this.frictionRepository.findOneBy({ id });
  }

  async runFrictionDetection(): Promise<FrictionEvent[]> {
    const [baselines, assessments, opportunities, events] = await Promise.all([
      this.baselineRepository.find({}),
      this.assessmentRepository.find({}),
      this.opportunityRepository.find({}),
      this.analyticsRepository.find({ order: { createdAt: 'DESC' }, take: 10000 }),
    ]);
    const now = Date.now();
    const emitted: FrictionEvent[] = [];
    const userIds = new Set<string>([
      ...baselines.map((x) => x.userId),
      ...assessments.map((x) => x.userId),
      ...opportunities.map((x) => x.userId),
      ...events.map((x) => x.userId).filter((x): x is string => Boolean(x)),
    ]);

    for (const userId of userIds) {
      const userBaselines = baselines.filter((x) => x.userId === userId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      const userAssessments = assessments.filter((x) => x.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const userOpportunities = opportunities.filter((x) => x.userId === userId);
      const userEvents = events.filter((x) => x.userId === userId);
      const latestBaseline = userBaselines[0] ?? null;
      const latestAssessment = userAssessments[0] ?? null;

      if (latestBaseline && (latestBaseline.latestBaselineScore ?? 50) < 100 && now - latestBaseline.updatedAt.getTime() >= 24 * 60 * 60 * 1000) {
        const created = await this.ensureFrictionEvent({ userId, eventType: FrictionEventType.BASELINE_ABANDONED, baselineId: latestBaseline.id, reason: 'Baseline progress below 100 with no updates for 24h+' });
        if (created) emitted.push(created);
      }

      if (latestAssessment && latestAssessment.overallScore < 70) {
        const baselineUpdatedAfter = latestBaseline && latestBaseline.updatedAt.getTime() > latestAssessment.createdAt.getTime();
        const reanalysis = userAssessments.some((entry) => entry.createdAt.getTime() > latestAssessment.createdAt.getTime());
        if (!baselineUpdatedAfter && !reanalysis && now - latestAssessment.createdAt.getTime() >= 24 * 60 * 60 * 1000) {
          const created = await this.ensureFrictionEvent({ userId, eventType: FrictionEventType.LOW_SCORE_NO_RECOVERY, analysisId: latestAssessment.id, baselineId: latestAssessment.baselineId, jobId: latestAssessment.jobId, reason: 'Low score with no baseline update or reanalysis after 24h+' });
          if (created) emitted.push(created);
        }
      }

      if (latestBaseline && latestAssessment && latestBaseline.updatedAt.getTime() > latestAssessment.createdAt.getTime()) {
        const reanalysisWithin24h = userAssessments.some((entry) => entry.createdAt.getTime() > latestBaseline.updatedAt.getTime() && entry.createdAt.getTime() - latestBaseline.updatedAt.getTime() <= 24 * 60 * 60 * 1000);
        if (!reanalysisWithin24h) {
          const created = await this.ensureFrictionEvent({ userId, eventType: FrictionEventType.REANALYSIS_AVAILABLE_NOT_USED, baselineId: latestBaseline.id, analysisId: latestAssessment.id, jobId: latestAssessment.jobId, reason: 'Baseline changed but no reanalysis within 24h.' });
          if (created) emitted.push(created);
        }
      }

      const generationFailures = userEvents.filter((e) =>
        e.eventName === 'resume_generation_limited' ||
        e.eventName === 'cover_letter_generation_limited' ||
        e.eventName === 'resume_generation_blocked_compliance' ||
        e.eventName === 'cover_letter_generation_blocked_compliance');
      if (generationFailures.length > 0) {
        const latest = generationFailures[0];
        const created = await this.ensureFrictionEvent({ userId, eventType: FrictionEventType.GENERATION_ATTEMPT_FAILED, reason: 'Generation attempt failed or was blocked.', metadata: { eventName: latest.eventName }, analysisId: typeof latest.properties?.analysisId === 'string' ? latest.properties.analysisId : null });
        if (created) emitted.push(created);
      }

      const recentGenAttempts = userEvents.filter((e) =>
        e.eventName === 'resume_generation_attempted' || e.eventName === 'cover_letter_generation_attempted')
        .filter((e) => now - e.createdAt.getTime() <= 6 * 60 * 60 * 1000);
      if (recentGenAttempts.length >= 2 && generationFailures.length >= 2) {
        const created = await this.ensureFrictionEvent({ userId, eventType: FrictionEventType.REPEATED_GENERATION_RETRY, reason: 'Repeated generation attempts with repeated failure/abandonment.', metadata: { attempts: recentGenAttempts.length, failures: generationFailures.length } });
        if (created) emitted.push(created);
      }

      if (latestAssessment && latestAssessment.overallScore >= 70 && userOpportunities.length === 0 && now - latestAssessment.createdAt.getTime() >= 24 * 60 * 60 * 1000) {
        const created = await this.ensureFrictionEvent({ userId, eventType: FrictionEventType.OPPORTUNITY_NOT_CREATED_AFTER_HIGH_SCORE, analysisId: latestAssessment.id, jobId: latestAssessment.jobId, baselineId: latestAssessment.baselineId, reason: 'High score without opportunity creation after 24h.' });
        if (created) emitted.push(created);
      }

      const fitReviewStarted = userEvents.some((e) => e.eventName === 'resume_studio_opened');
      const fitReviewProgress = userEvents.some((e) => e.eventName === 'resume_generation_succeeded' || e.eventName === 'cover_letter_generation_succeeded');
      const latestStudioEvent = userEvents.find((e) => e.eventName === 'resume_studio_opened');
      if (fitReviewStarted && !fitReviewProgress && latestStudioEvent && now - latestStudioEvent.createdAt.getTime() >= 24 * 60 * 60 * 1000) {
        const created = await this.ensureFrictionEvent({ userId, eventType: FrictionEventType.FIT_REVIEW_STARTED_NOT_COMPLETED, reason: 'Fit review/studio started but no completion action in 24h.' });
        if (created) emitted.push(created);
      }

      const resultViews = userEvents.filter((e) => e.path?.includes('/results'));
      const downstreamAction = userEvents.some((e) =>
        e.eventName === 'resume_studio_opened' ||
        e.eventName === 'opportunity_saved' ||
        e.eventName === 'role_analysis_started');
      if (resultViews.length >= 3 && !downstreamAction) {
        const created = await this.ensureFrictionEvent({ userId, eventType: FrictionEventType.REPEATED_RESULTS_VIEW_NO_ACTION, reason: 'Results viewed repeatedly with no downstream action.' });
        if (created) emitted.push(created);
      }
    }
    return emitted;
  }

  async getFrictionPatterns() {
    const [feedback, friction] = await Promise.all([
      this.feedbackRepository.find({ order: { createdAt: 'DESC' } }),
      this.frictionRepository.find({ order: { createdAt: 'DESC' } }),
    ]);
    const grouped = new Map<string, { patternKey: string; label: string; count: number; users: Set<string>; latestSeenAt: Date; severityMix: Record<string, number> }>();
    for (const item of feedback) {
      const key = `feedback:${item.category}:${item.pageContext ?? 'unknown'}`;
      const existing = grouped.get(key) ?? { patternKey: key, label: `Feedback ${item.category} @ ${item.pageContext ?? 'unknown'}`, count: 0, users: new Set<string>(), latestSeenAt: item.createdAt, severityMix: {} };
      existing.count += 1;
      existing.users.add(item.userId);
      if (item.createdAt > existing.latestSeenAt) existing.latestSeenAt = item.createdAt;
      existing.severityMix[item.severity] = (existing.severityMix[item.severity] ?? 0) + 1;
      grouped.set(key, existing);
    }
    for (const item of friction) {
      const normalizedReasonKey = item.reason.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 50);
      const key = `friction:${item.eventType}:${normalizedReasonKey}`;
      const existing = grouped.get(key) ?? { patternKey: key, label: `${item.eventType}`, count: 0, users: new Set<string>(), latestSeenAt: item.createdAt, severityMix: {} };
      existing.count += 1;
      existing.users.add(item.userId);
      if (item.createdAt > existing.latestSeenAt) existing.latestSeenAt = item.createdAt;
      existing.severityMix[item.severity] = (existing.severityMix[item.severity] ?? 0) + 1;
      grouped.set(key, existing);
    }
    return Array.from(grouped.values()).map((entry) => ({
      patternKey: entry.patternKey,
      label: entry.label,
      count: entry.count,
      affectedUsers: entry.users.size,
      latestSeenAt: entry.latestSeenAt,
      severityMix: entry.severityMix,
    })).sort((a, b) => b.count - a.count);
  }

  private async ensureFrictionEvent(input: {
    userId: string;
    eventType: FrictionEventType;
    reason: string;
    analysisId?: string | null;
    jobId?: string | null;
    baselineId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<FrictionEvent | null> {
    const existing = await this.frictionRepository.findOne({
      where: {
        userId: input.userId,
        eventType: input.eventType,
        resolutionStatus: FrictionResolutionStatus.OPEN,
      },
      order: { createdAt: 'DESC' },
    });
    if (existing && existing.reason === input.reason) return null;
    const severity =
      input.eventType === FrictionEventType.GENERATION_ATTEMPT_FAILED ||
      input.eventType === FrictionEventType.REPEATED_GENERATION_RETRY
        ? FeedbackSeverity.HIGH
        : FeedbackSeverity.MEDIUM;
    const entity = this.frictionRepository.create({
      userId: input.userId,
      eventType: input.eventType,
      reason: input.reason,
      analysisId: input.analysisId ?? null,
      jobId: input.jobId ?? null,
      baselineId: input.baselineId ?? null,
      metadata: input.metadata ?? null,
      resolutionStatus: FrictionResolutionStatus.OPEN,
      severity,
    });
    return this.frictionRepository.save(entity);
  }

  private async computeRecovery(event: FrictionEvent): Promise<{ recovered: boolean; recoveredAt: Date | null; recoveryAction: string | null }> {
    const [baselines, assessments, opportunities, events] = await Promise.all([
      this.baselineRepository.find({ where: { userId: event.userId }, order: { updatedAt: 'DESC' }, take: 5 }),
      this.assessmentRepository.find({ where: { userId: event.userId }, order: { createdAt: 'DESC' }, take: 10 }),
      this.opportunityRepository.find({ where: { userId: event.userId }, order: { dateCreated: 'DESC' }, take: 10 }),
      this.analyticsRepository.find({ where: { userId: event.userId }, order: { createdAt: 'DESC' }, take: 30 }),
    ]);
    const after = (date: Date) => date.getTime() > event.createdAt.getTime();
    if (event.eventType === FrictionEventType.BASELINE_ABANDONED) {
      const recoveredBaseline = baselines.find((entry) => (entry.latestBaselineScore ?? 0) >= 100 && after(entry.updatedAt));
      if (recoveredBaseline) return { recovered: true, recoveredAt: recoveredBaseline.updatedAt, recoveryAction: 'baseline_completed' };
    }
    if (event.eventType === FrictionEventType.LOW_SCORE_NO_RECOVERY) {
      const baselineUpdate = baselines.find((entry) => after(entry.updatedAt));
      const reanalysis = assessments.find((entry) => after(entry.createdAt));
      if (baselineUpdate && reanalysis) return { recovered: true, recoveredAt: reanalysis.createdAt, recoveryAction: 'baseline_updated_and_reanalyzed' };
    }
    if (event.eventType === FrictionEventType.GENERATION_ATTEMPT_FAILED) {
      const success = events.find((entry) => (entry.eventName === 'resume_generation_succeeded' || entry.eventName === 'cover_letter_generation_succeeded') && after(entry.createdAt));
      if (success) return { recovered: true, recoveredAt: success.createdAt, recoveryAction: 'generation_succeeded' };
    }
    if (event.eventType === FrictionEventType.OPPORTUNITY_NOT_CREATED_AFTER_HIGH_SCORE) {
      const created = opportunities.find((entry) => after(entry.dateCreated));
      if (created) return { recovered: true, recoveredAt: created.dateCreated, recoveryAction: 'opportunity_created' };
    }
    return { recovered: false, recoveredAt: null, recoveryAction: null };
  }
}
