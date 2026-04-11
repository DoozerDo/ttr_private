import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineVersionService } from '../baseline/baseline-version.service';
import { AnalysisService } from '../analysis/analysis.service';
import { WorkflowIdempotencyService } from '../common/workflow-idempotency.service';
import { FitAssessmentVerdict } from '../analysis/fit-assessment.entity';
import { ComplianceFlagSeverity } from '../compliance/compliance.types';
import { GapDetectionService } from './gap-detection.service';
import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import { CreateInterviewRecordDto } from './dto/create-interview.dto';
import { CreateInterviewAcceptedAdditionDto } from './dto/create-accepted-addition.dto';
import { UpdateInterviewRecordDto } from './dto/update-interview.dto';
import { Interview } from './interview.entity';
import {
  InterviewAcceptedAddition,
  InterviewAcceptedAdditionStatus,
} from './interview-accepted-addition.entity';
import {
  InterviewGap,
  InterviewQuestion,
  RecommendedAddition,
  RecommendedAdditionSource,
  RecommendedAdditionStatus,
} from './interview-types';
import { RecommendedAdditionsService } from './recommended-additions.service';

function normalizeStringArray(value?: unknown[]): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function normalizeGapList(value?: unknown[]): InterviewGap[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is InterviewGap =>
          typeof entry === 'object' && entry !== null,
      )
    : [];
}

function normalizeQuestionList(value?: unknown[]): InterviewQuestion[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is InterviewQuestion =>
          typeof entry === 'object' && entry !== null,
      )
    : [];
}

function normalizeAdditionStatus(value?: unknown): RecommendedAdditionStatus {
  return value === 'accepted' || value === 'rejected' ? value : 'proposed';
}

function normalizeAdditionSources(
  value?: unknown,
): RecommendedAdditionSource[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry): RecommendedAdditionSource | null => {
      if (!entry || typeof entry !== 'object') return null;

      const raw = entry as Partial<RecommendedAdditionSource>;

      const gapId = typeof raw.gapId === 'string' ? raw.gapId : undefined;
      const questionIndex =
        typeof raw.questionIndex === 'number' ? raw.questionIndex : undefined;
      const questionPrompt =
        typeof raw.questionPrompt === 'string' ? raw.questionPrompt : undefined;

      if (
        gapId === undefined &&
        questionIndex === undefined &&
        questionPrompt === undefined
      ) {
        return null;
      }

      const source: RecommendedAdditionSource = {
        ...(gapId !== undefined ? { gapId } : {}),
        ...(questionIndex !== undefined ? { questionIndex } : {}),
        ...(questionPrompt !== undefined ? { questionPrompt } : {}),
      };

      return source;
    })
    .filter((entry): entry is RecommendedAdditionSource => entry !== null);
}

function buildAdditionId(
  text: string,
  sources: RecommendedAdditionSource[],
): string {
  return createHash('sha256')
    .update(JSON.stringify({ text, sources }))
    .digest('hex');
}

function normalizeRecommendedAdditions(
  value?: unknown[],
): RecommendedAddition[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        const text = entry.trim();
        if (!text) return null;

        return {
          id: buildAdditionId(text, []),
          text,
          sources: [],
          status: 'proposed' as const,
        };
      }

      if (!entry || typeof entry !== 'object') return null;

      const addition = entry as RecommendedAddition;
      const text =
        typeof addition.text === 'string' ? addition.text.trim() : '';
      if (!text) return null;

      const sources = normalizeAdditionSources(addition.sources);
      const status = normalizeAdditionStatus(addition.status);

      return {
        id:
          typeof addition.id === 'string' && addition.id
            ? addition.id
            : buildAdditionId(text, sources),
        text,
        sources,
        status,
      };
  })
  .filter((entry): entry is RecommendedAddition => Boolean(entry));
}

export type ExpandedFitComputeErrorCode =
  | 'interview_not_found'
  | 'baseline_not_found'
  | 'target_context_missing'
  | 'insufficient_answers'
  | 'invalid_promotion_state'
  | 'baseline_version_mismatch'
  | 'computation_timeout'
  | 'computation_failed'
  | 'expanded_fit_in_flight'
  | 'stale_request_ignored'
  | 'artifact_write_conflict';

export type ExpandedFitComputeNextAction =
  | 'save_more_answers'
  | 'review_results'
  | 'return_to_baseline'
  | 'return_to_results'
  | 'retry_compute'
  | 'retry_later'
  | 'promote_baseline';

export type ExpandedFitComputePayload = Interview & {
  baselineVersionHash: string | null;
};

export type ExpandedFitComputeSuccess = {
  status: 'success';
  code: 'expanded_fit_ready';
  message: string;
  retryable: false;
  nextAction: 'review_results';
  payload: ExpandedFitComputePayload;
  runId: string;
  idempotency?: {
    status:
      | 'accepted_new'
      | 'existing_in_flight'
      | 'existing_completed'
      | 'rejected_stale'
      | 'persistence_conflict';
    runId: string;
    dedupeKey: string;
    reused: boolean;
  };
};

export type ExpandedFitComputeError = {
  status: 'error';
  code: ExpandedFitComputeErrorCode;
  message: string;
  retryable: boolean;
  nextAction: ExpandedFitComputeNextAction;
  runId: string;
  idempotency?: {
    status:
      | 'accepted_new'
      | 'existing_in_flight'
      | 'existing_completed'
      | 'rejected_stale'
      | 'persistence_conflict';
    runId: string;
    dedupeKey: string;
    reused: boolean;
  };
};

export type ExpandedFitComputeOutcome =
  | ExpandedFitComputeSuccess
  | ExpandedFitComputeError;

@Injectable()
export class InterviewRecordsService {
  private readonly logger = new Logger(InterviewRecordsService.name);

  constructor(
    @InjectRepository(Interview)
    private readonly interviewsRepo: Repository<Interview>,
    @InjectRepository(InterviewAcceptedAddition)
    private readonly acceptedAdditionsRepository: Repository<InterviewAcceptedAddition>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    private readonly gapDetectionService: GapDetectionService,
    private readonly interviewQuestionGenerator: InterviewQuestionGeneratorService,
    private readonly recommendedAdditionsService: RecommendedAdditionsService,
    private readonly baselineVersionService: BaselineVersionService,
    private readonly analysisService: AnalysisService,
    private readonly workflowIdempotencyService: WorkflowIdempotencyService,
  ) {}

  private requireJobId(jobId?: string): string {
    const normalized = jobId?.trim();
    if (!normalized) throw new BadRequestException('jobId is required');
    return normalized;
  }

  private requireBaselineVersionId(baselineVersionId?: string): string {
    const normalized = baselineVersionId?.trim();
    if (!normalized)
      throw new BadRequestException('baselineVersionId is required');
    return normalized;
  }

  private async resolveBaselineVersionIdFromCompatInput(input: {
    baselineVersionId?: string | null;
    baselineId?: string | null;
  }): Promise<string> {
    const baselineVersionId = input.baselineVersionId?.trim();
    if (baselineVersionId) return baselineVersionId;

    const baselineId = input.baselineId?.trim();
    if (!baselineId) {
      throw new BadRequestException(
        'baselineVersionId is required when baselineId is not provided',
      );
    }

    const latestVersion = await this.baselineVersionRepository.findOne({
      where: { baselineId },
      order: { versionNumber: 'DESC' },
    });

    if (!latestVersion?.id) {
      throw new BadRequestException(
        'No baseline version found for the provided baselineId',
      );
    }

    return latestVersion.id;
  }

  private hasBlockingCompliance(
    validationResults: Record<string, unknown> | undefined | null,
  ): boolean {
    if (!validationResults) return false;

    const blocked = Boolean(
      (validationResults as { blocked?: boolean }).blocked,
    );
    if (blocked) return true;

    const flags = (
      validationResults as { complianceFlags?: Array<{ severity?: string }> }
    ).complianceFlags;
    if (!Array.isArray(flags)) return false;

    return flags.some(
      (flag) => flag?.severity === ComplianceFlagSeverity.BLOCK,
    );
  }

  private normalizeAcceptedAdditionIds(value?: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const unique = new Set<string>();
    value.forEach((entry) => {
      if (typeof entry !== 'string') return;
      const trimmed = entry.trim();
      if (trimmed) unique.add(trimmed);
    });
    return Array.from(unique);
  }

  private filterAcceptedAdditionIds(
    additions: RecommendedAddition[],
    acceptedIds?: string[] | null,
  ): string[] {
    const acceptedSet = new Set(
      this.normalizeAcceptedAdditionIds(acceptedIds ?? []),
    );
    if (!acceptedSet.size) return [];
    const validIds = new Set(additions.map((addition) => addition.id));
    return Array.from(acceptedSet).filter((id) => validIds.has(id));
  }

  private buildFallbackRecommendedAddition(
    gap: InterviewGap,
    index: number,
  ): RecommendedAddition {
    const domainLabel = gap.domain
      ? gap.domain.replace(/[_-]+/g, ' ')
      : 'experience';
    const text = `Share a ${domainLabel} story that addresses ${gap.gapId}.`;
    return {
      id: `gap-fallback-${gap.gapId}-${index}`,
      text,
      sources: [{ gapId: gap.gapId }],
      status: 'proposed',
    };
  }

  private async getBaselineVersionHash(
    baselineVersionId?: string | null,
  ): Promise<string | null> {
    if (!baselineVersionId?.trim()) return null;
    const record = await this.baselineVersionRepository.findOne({
      where: { id: baselineVersionId },
    });
    return record?.fileHash ?? null;
  }

  private async getBaselineVersionNumber(
    baselineVersionId?: string | null,
  ): Promise<number | undefined> {
    if (!baselineVersionId?.trim()) return undefined;
    const record = await this.baselineVersionRepository.findOne({
      where: { id: baselineVersionId },
    });
    return record?.versionNumber ?? undefined;
  }

  private async buildInterviewResponse(interview: Interview) {
    const baselineVersionHash = await this.getBaselineVersionHash(
      interview.baselineVersionId,
    );
    return { ...interview, baselineVersionHash };
  }

  private buildExpandedFitError(
    code: ExpandedFitComputeErrorCode,
    message: string,
    nextAction: ExpandedFitComputeNextAction,
    retryable: boolean,
    runId: string,
  ): ExpandedFitComputeError {
    return {
      status: 'error',
      code,
      message,
      retryable,
      nextAction,
      runId,
    };
  }

  private buildExpandedFitRequestHash(input: {
    interviewId: string;
    baselineId: string | null;
    baselineVersionId: string | null;
    jobId: string;
    responses: string[];
    recommendedAdditions: RecommendedAddition[];
    acceptedAdditionIds: string[];
  }) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          interviewId: input.interviewId,
          baselineId: input.baselineId,
          baselineVersionId: input.baselineVersionId,
          jobId: input.jobId,
          responses: input.responses,
          recommendedAdditions: input.recommendedAdditions.map((addition) => ({
            id: addition.id,
            text: addition.text,
            status: addition.status,
          })),
          acceptedAdditionIds: input.acceptedAdditionIds,
        }),
      )
      .digest('hex');
  }

  private buildExpandedFitDedupeKey(input: {
    userId: string;
    interviewId: string;
    baselineId: string;
    baselineVersion: number;
    jobId: string;
    requestHash: string;
  }) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          operation: 'analysis.expanded_fit',
          userId: input.userId,
          interviewId: input.interviewId,
          baselineId: input.baselineId,
          baselineVersion: input.baselineVersion,
          jobId: input.jobId,
          requestHash: input.requestHash,
        }),
      )
      .digest('hex');
  }

  private classifyExpandedFitFailure(
    error: unknown,
    runId: string,
  ): ExpandedFitComputeError {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const responseRecord =
        response && typeof response === 'object'
          ? (response as Record<string, unknown>)
          : null;
      const nestedError =
        responseRecord && typeof responseRecord.error === 'object'
          ? (responseRecord.error as Record<string, unknown>)
          : null;
      const code =
        (typeof nestedError?.code === 'string' && nestedError.code) ||
        (typeof responseRecord?.code === 'string' && responseRecord.code) ||
        null;
      const message =
        (typeof nestedError?.message === 'string' && nestedError.message) ||
        (typeof responseRecord?.message === 'string' && responseRecord.message) ||
        error.message ||
        'Expanded fit could not be computed right now.';
      const lowerMessage = message.toLowerCase();

      if (lowerMessage.includes('interview record not found') || lowerMessage.includes('interview not found')) {
        return this.buildExpandedFitError(
          'interview_not_found',
          'This interview could not be found. Return to Results and start a new expansion review.',
          'return_to_results',
          true,
          runId,
        );
      }

      if (code === 'interview_not_found') {
        return this.buildExpandedFitError(
          'interview_not_found',
          'This interview could not be found. Return to Results and start a new expansion review.',
          'return_to_results',
          true,
          runId,
        );
      }

      if (code === 'baseline_not_found' || lowerMessage.includes('baseline not found')) {
        return this.buildExpandedFitError(
          'baseline_not_found',
          'The linked baseline could not be found. Return to Baseline and pick a current version.',
          'return_to_baseline',
          true,
          runId,
        );
      }

      if (
        code === 'baseline_version_mismatch' ||
        code === 'invalid_baseline_linkage' ||
        lowerMessage.includes('missing a valid baseline version') ||
        lowerMessage.includes('baselineversion must be a positive integer')
      ) {
        return this.buildExpandedFitError(
          'baseline_version_mismatch',
          'The interview is attached to an outdated or missing baseline version. Re-select the baseline and try again.',
          'return_to_baseline',
          true,
          runId,
        );
      }

      if (
        code === 'missing_baseline_link' ||
        code === 'missing_job_context' ||
        code === 'target_context_missing' ||
        lowerMessage.includes('baselineid and jobid are required') ||
        lowerMessage.includes('missing a job description')
      ) {
        return this.buildExpandedFitError(
          'target_context_missing',
          'The interview is missing its linked job or target context. Return to Results, reconnect the role, and try again.',
          'return_to_results',
          true,
          runId,
        );
      }

      if (
        code === 'incomplete_answers' ||
        code === 'insufficient_answers' ||
        lowerMessage.includes('verified additions are required') ||
        lowerMessage.includes('add at least one supported response')
      ) {
        return this.buildExpandedFitError(
          'insufficient_answers',
          'More responses are needed before expanded fit can be computed.',
          'save_more_answers',
          true,
          runId,
        );
      }

      if (code === 'stale_request_ignored') {
        return this.buildExpandedFitError(
          'stale_request_ignored',
          message,
          'save_more_answers',
          true,
          runId,
        );
      }

      if (code === 'artifact_write_conflict') {
        return this.buildExpandedFitError(
          'artifact_write_conflict',
          message,
          'retry_compute',
          true,
          runId,
        );
      }

      if (code === 'expanded_fit_in_flight') {
        return this.buildExpandedFitError(
          'expanded_fit_in_flight',
          message,
          'retry_compute',
          true,
          runId,
        );
      }

      if (code === 'timeout' || code === 'computation_timeout') {
        return this.buildExpandedFitError(
          'computation_timeout',
          'This is taking longer than expected. Please try again.',
          'retry_compute',
          true,
          runId,
        );
      }

      if (code === 'invalid_promotion_state') {
        return this.buildExpandedFitError(
          'invalid_promotion_state',
          message,
          'promote_baseline',
          false,
          runId,
        );
      }

      return this.buildExpandedFitError(
        'computation_failed',
        message || 'Expanded fit could not be computed right now.',
        'retry_compute',
        true,
        runId,
      );
    }

    if (error instanceof Error && /timeout/i.test(error.message)) {
      return this.buildExpandedFitError(
        'computation_timeout',
        'This is taking longer than expected. Please try again.',
        'retry_compute',
        true,
        runId,
      );
    }

    return this.buildExpandedFitError(
      'computation_failed',
      'Expanded fit could not be computed right now. Save your answers and try again.',
      'retry_compute',
      true,
      runId,
    );
  }

  private scoreToVerdict(score?: number | null) {
    if (typeof score !== 'number' || Number.isNaN(score)) return null;
    if (score >= 80) return FitAssessmentVerdict.APPLY;
    if (score >= 60) return FitAssessmentVerdict.CONSIDER;
    return FitAssessmentVerdict.SKIP;
  }

  async createInterviewRecord(
    userId: string,
    dto: CreateInterviewRecordDto,
  ): Promise<Interview> {
    const jobId = this.requireJobId(dto.jobId);
    const baselineVersionId = this.requireBaselineVersionId(
      dto.baselineVersionId,
    );

    const detection = await this.gapDetectionService.detectGaps({
      userId,
      jobId,
      baselineVersionId,
    });

    const gapList = dto.gapList?.length
      ? normalizeGapList(dto.gapList)
      : detection.gaps;

    const questions = dto.questions?.length
      ? normalizeQuestionList(dto.questions)
      : this.interviewQuestionGenerator.generateQuestions(gapList);

    const interview = this.interviewsRepo.create({
      userId,
      baselineId: detection.baselineId ?? dto.baselineId ?? null,
      baselineVersionId: detection.baselineVersionId ?? baselineVersionId,
      jobId: detection.jobId ?? jobId,
      gapList,
      questions,
      responses: normalizeStringArray(dto.responses),
      validationResults: dto.validationResults ?? {},
      recommendedAdditions: normalizeRecommendedAdditions(
        dto.recommendedAdditions,
      ),
    });

    const saved = await this.interviewsRepo.save(interview);
    return this.buildInterviewResponse(saved);
  }

  async listInterviewRecordsForUser(userId: string): Promise<Interview[]> {
    return this.interviewsRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getInterviewRecordForUser(
    id: string,
    userId: string,
  ): Promise<Interview> {
    const interview = await this.interviewsRepo.findOne({
      where: { id, userId },
    });

    if (!interview) {
      throw new NotFoundException('Interview record not found');
    }

    return interview;
  }

  async getInterviewRecordForUserResponse(
    id: string,
    userId: string,
  ): Promise<Interview> {
    const interview = await this.getInterviewRecordForUser(id, userId);
    return this.buildInterviewResponse(interview);
  }

  async updateInterviewRecord(
    id: string,
    userId: string,
    dto: UpdateInterviewRecordDto,
  ): Promise<Interview> {
    const interview = await this.getInterviewRecordForUser(id, userId);

    if (dto.jobId !== undefined) {
      const jobId = dto.jobId.trim();
      if (!jobId) throw new BadRequestException('jobId cannot be empty');
      interview.jobId = jobId;
    }

    if (dto.baselineId !== undefined) {
      interview.baselineId = dto.baselineId?.trim() || null;
    }

    if (dto.baselineVersionId !== undefined) {
      interview.baselineVersionId = dto.baselineVersionId?.trim() || null;
    }

    if (dto.gapList !== undefined) {
      interview.gapList = normalizeGapList(dto.gapList);
    }

    if (dto.questions !== undefined) {
      interview.questions = normalizeQuestionList(dto.questions);
    }

    if (dto.responses !== undefined) {
      interview.responses = normalizeStringArray(dto.responses);
    }

    if (dto.validationResults !== undefined) {
      interview.validationResults = dto.validationResults ?? {};
    }

    if (this.hasBlockingCompliance(interview.validationResults)) {
      interview.recommendedAdditions = [];
    } else {
      interview.recommendedAdditions =
        this.recommendedAdditionsService.generateFromResponses({
          responses: interview.responses,
          questions: interview.questions,
          gaps: interview.gapList,
        });
    }

    interview.acceptedAdditionIds = this.filterAcceptedAdditionIds(
      interview.recommendedAdditions,
      interview.acceptedAdditionIds,
    );

    if (
      dto.responses !== undefined ||
      dto.questions !== undefined ||
      dto.gapList !== undefined ||
      dto.validationResults !== undefined
    ) {
      interview.expandedFitAssessment = null;
    }

    const saved = await this.interviewsRepo.save(interview);
    return this.buildInterviewResponse(saved);
  }

  async applyAdditionDecisions(
    id: string,
    userId: string,
    body: unknown,
  ): Promise<Interview> {
    const interview = await this.getInterviewRecordForUser(id, userId);

    const existing = Array.isArray(interview.recommendedAdditions)
      ? interview.recommendedAdditions
      : [];

    const payload = (body ?? {}) as {
      decisions?: Array<Record<string, unknown>>;
      additions?: Array<Record<string, unknown>>;
      acceptedIds?: string[];
      rejectedIds?: string[];
    };

    const decisionsList = Array.isArray(payload.decisions)
      ? payload.decisions
      : Array.isArray(payload.additions)
        ? payload.additions
        : [];

    const acceptedSet = new Set(
      Array.isArray(payload.acceptedIds) ? payload.acceptedIds : [],
    );
    const rejectedSet = new Set(
      Array.isArray(payload.rejectedIds) ? payload.rejectedIds : [],
    );

    const statusById = new Map<string, RecommendedAdditionStatus>();
    for (const decision of decisionsList) {
      const idValue =
        typeof decision.id === 'string'
          ? decision.id
          : typeof decision.additionId === 'string'
            ? decision.additionId
            : '';
      const rawStatus =
        typeof decision.status === 'string'
          ? decision.status
          : typeof decision.decision === 'string'
            ? decision.decision
            : null;
      const statusValue =
        rawStatus === 'accepted' ||
        rawStatus === 'rejected' ||
        rawStatus === 'deferred'
          ? rawStatus
          : rawStatus === 'accept'
            ? 'accepted'
            : rawStatus === 'reject'
              ? 'rejected'
              : rawStatus === 'defer'
                ? 'deferred'
                : null;
      if (idValue && statusValue) statusById.set(idValue, statusValue);
    }

    interview.recommendedAdditions = existing.map((addition) => {
      const nextStatus =
        statusById.get(addition.id) ??
        (acceptedSet.has(addition.id)
          ? 'accepted'
          : rejectedSet.has(addition.id)
            ? 'rejected'
            : undefined);

      return nextStatus ? { ...addition, status: nextStatus } : addition;
    });

    const saved = await this.interviewsRepo.save(interview);
    return this.buildInterviewResponse(saved);
  }

  async updateAcceptedAdditions(
    id: string,
    userId: string,
    acceptedAdditionIds: string[],
  ): Promise<Interview> {
    const interview = await this.getInterviewRecordForUser(id, userId);

    const recommendedAdditions = Array.isArray(interview.recommendedAdditions)
      ? interview.recommendedAdditions
      : [];
    const normalizedIds =
      this.normalizeAcceptedAdditionIds(acceptedAdditionIds);
    const knownIds = new Set(
      recommendedAdditions.map((addition) => addition.id),
    );
    const invalidIds = normalizedIds.filter(
      (additionId) => !knownIds.has(additionId),
    );

    if (invalidIds.length) {
      throw new BadRequestException(
        'acceptedAdditionIds contain unknown addition ids',
      );
    }

    interview.acceptedAdditionIds = normalizedIds;
    interview.expandedFitAssessment = null;

    const saved = await this.interviewsRepo.save(interview);
    return this.buildInterviewResponse(saved);
  }

  async listRecommendedAdditions(
    id: string,
    userId: string,
  ): Promise<RecommendedAddition[]> {
    const interview = await this.getInterviewRecordForUser(id, userId);

    const normalized = normalizeRecommendedAdditions(
      interview.recommendedAdditions,
    );
    const gaps = Array.isArray(interview.gapList) ? interview.gapList : [];

    const coveredGapIds = new Set<string>();
    normalized.forEach((addition) => {
      addition.sources.forEach((source) => {
        if (source.gapId) {
          coveredGapIds.add(source.gapId);
        }
      });
    });

    const fallbackAdditions = gaps
      .filter((gap) => !coveredGapIds.has(gap.gapId))
      .map((gap, index) => this.buildFallbackRecommendedAddition(gap, index));

    return [...normalized, ...fallbackAdditions];
  }

  async acceptRecommendation(
    id: string,
    userId: string,
    dto: CreateInterviewAcceptedAdditionDto,
  ): Promise<InterviewAcceptedAddition> {
    const interview = await this.getInterviewRecordForUser(id, userId);

    const gapId = dto.gapId?.trim();
    if (!gapId) {
      throw new BadRequestException('gapId is required');
    }

    const suggestion = dto.suggestion?.trim();
    if (!suggestion) {
      throw new BadRequestException('suggestion is required');
    }

    const standardizedCategory = dto.category?.trim() ?? null;
    const standardizedDomain = dto.domain?.trim() ?? null;
    const recommendedAdditionId = dto.recommendedAdditionId?.trim() ?? null;

    const existing = await this.acceptedAdditionsRepository.findOne({
      where: {
        interviewId: interview.id,
        gapId,
        suggestion,
      },
    });

    if (existing) {
      return existing;
    }

    const addition = this.acceptedAdditionsRepository.create({
      interviewId: interview.id,
      gapId,
      category: standardizedCategory,
      domain: standardizedDomain,
      suggestion,
      status: 'ACCEPTED' as InterviewAcceptedAdditionStatus,
      recommendedAdditionId,
    });

    return this.acceptedAdditionsRepository.save(addition);
  }

  async listAcceptedAdditions(
    id: string,
    userId: string,
  ): Promise<InterviewAcceptedAddition[]> {
    const interview = await this.getInterviewRecordForUser(id, userId);
    return this.fetchAcceptedAdditions(interview.id);
  }

  private async fetchAcceptedAdditions(
    interviewId: string,
  ): Promise<InterviewAcceptedAddition[]> {
    return this.acceptedAdditionsRepository.find({
      where: { interviewId },
      order: { createdAt: 'ASC' },
    });
  }

  async computeExpandedFit(
    id: string,
    userId: string,
    options?: { runId?: string },
  ): Promise<ExpandedFitComputeOutcome> {
    const runId = options?.runId ?? randomUUID();
    const startedAt = Date.now();
    let dedupeKey: string | undefined;
    this.logger.log(
      `[expanded-fit] start runId=${runId} interviewRecordId=${id} userId=${userId}`,
    );

    try {
      const interview = await this.getInterviewRecordForUser(id, userId);
      const answerCount = Array.isArray(interview.responses)
        ? interview.responses.filter((response) => Boolean(response?.trim?.())).length
        : 0;
      const decisionCounts = Array.isArray(interview.recommendedAdditions)
        ? interview.recommendedAdditions.reduce(
            (acc, addition) => {
              if (addition.status === 'accepted') acc.accepted += 1;
              else if (addition.status === 'rejected') acc.rejected += 1;
              else if (addition.status === 'deferred') acc.deferred += 1;
              return acc;
            },
            { accepted: 0, rejected: 0, deferred: 0 },
          )
        : { accepted: 0, rejected: 0, deferred: 0 };

      this.logger.log(
        `[expanded-fit] context runId=${runId} interviewRecordId=${id} baselineId=${interview.baselineId ?? 'missing'} baselineVersionId=${interview.baselineVersionId ?? 'missing'} jobId=${interview.jobId ?? 'missing'} answerCount=${answerCount} decisionCounts=${JSON.stringify(decisionCounts)}`,
      );
      const fail = (outcome: ExpandedFitComputeError) => {
        this.logger.warn(
          `[expanded-fit] failure runId=${runId} interviewRecordId=${id} code=${outcome.code} durationMs=${Date.now() - startedAt}`,
        );
        return outcome;
      };

      if (!interview.baselineId?.trim()) {
        return fail(
          this.buildExpandedFitError(
          'target_context_missing',
          'This interview is missing a linked baseline. Re-open Results and choose a baseline before computing expanded fit.',
          'return_to_results',
          true,
          runId,
          ),
        );
      }

      if (!interview.jobId?.trim()) {
        return fail(
          this.buildExpandedFitError(
          'target_context_missing',
          'This interview is missing a job description. Return to Results or Opportunities and attach the role before computing expanded fit.',
          'return_to_results',
          true,
          runId,
          ),
        );
      }

      const acceptedAdditions = await this.fetchAcceptedAdditions(interview.id);
      const verifiedAdditions = Array.from(
        new Set(
          acceptedAdditions
            .map((addition) => addition.suggestion?.trim())
            .filter((text): text is string => Boolean(text)),
        ),
      );

      if (!verifiedAdditions.length) {
        return fail(
          this.buildExpandedFitError(
          'insufficient_answers',
          'More responses are needed before expanded fit can be computed.',
          'save_more_answers',
          true,
          runId,
          ),
        );
      }

      const baselineVersionNumber = await this.getBaselineVersionNumber(
        interview.baselineVersionId,
      );

      if (!baselineVersionNumber) {
        return fail(
          this.buildExpandedFitError(
          'baseline_version_mismatch',
          'This interview is missing a valid baseline version. Refresh the baseline selection and try again.',
          'return_to_baseline',
          true,
          runId,
          ),
        );
      }

      const requestHash = this.buildExpandedFitRequestHash({
        interviewId: interview.id,
        baselineId: interview.baselineId,
        baselineVersionId: interview.baselineVersionId,
        jobId: interview.jobId,
        responses: normalizeStringArray(interview.responses).map((response) =>
          response.trim(),
        ),
        recommendedAdditions: normalizeRecommendedAdditions(
          interview.recommendedAdditions,
        ),
        acceptedAdditionIds: this.normalizeAcceptedAdditionIds(
          interview.acceptedAdditionIds ?? [],
        ),
      });
      dedupeKey = this.buildExpandedFitDedupeKey({
        userId,
        interviewId: interview.id,
        baselineId: interview.baselineId!,
        baselineVersion: baselineVersionNumber,
        jobId: interview.jobId!,
        requestHash,
      });
      const reservation = await this.workflowIdempotencyService.reserve<ExpandedFitComputeOutcome>({
        userId,
        operationName: 'analysis.expanded_fit',
        dedupeKey,
        runId,
      });

      if (reservation.status === 'existing_completed' && reservation.responseBody) {
        return {
          ...(reservation.responseBody as ExpandedFitComputeOutcome),
          idempotency: {
            status: reservation.status,
            runId: reservation.runId,
            dedupeKey,
            reused: true,
          },
        } as ExpandedFitComputeOutcome;
      }

      if (reservation.status === 'existing_in_flight') {
        return fail(
          this.buildExpandedFitError(
            'expanded_fit_in_flight',
            'Expanded fit is already running for this interview. Please wait for it to finish.',
            'retry_compute',
            true,
            runId,
          ),
        );
      }

      const idempotencyMeta = {
        status: reservation.status,
        runId: reservation.runId,
        dedupeKey,
        reused: reservation.status === 'existing_completed',
      } as const;

      let expansion;
      try {
        expansion = await this.analysisService.runExpandedFitAssessment(
          userId,
          {
            jobId: interview.jobId,
            baselineId: interview.baselineId,
            baselineVersion: baselineVersionNumber,
            interviewId: interview.id,
            verifiedAdditions,
          },
        );
      } catch (error) {
        const classified = this.classifyExpandedFitFailure(error, runId);
        await this.workflowIdempotencyService.complete({
          userId,
          operationName: 'analysis.expanded_fit',
          dedupeKey,
          runId,
          responseBody: classified,
        });
        return fail(classified);
      }

      const liveInterview = await this.getInterviewRecordForUser(id, userId);
      const liveRequestHash = this.buildExpandedFitRequestHash({
        interviewId: liveInterview.id,
        baselineId: liveInterview.baselineId,
        baselineVersionId: liveInterview.baselineVersionId,
        jobId: liveInterview.jobId,
        responses: normalizeStringArray(liveInterview.responses).map((response) =>
          response.trim(),
        ),
        recommendedAdditions: normalizeRecommendedAdditions(
          liveInterview.recommendedAdditions,
        ),
        acceptedAdditionIds: this.normalizeAcceptedAdditionIds(
          liveInterview.acceptedAdditionIds ?? [],
        ),
      });

      if (liveRequestHash !== requestHash) {
        const stale = this.buildExpandedFitError(
          'stale_request_ignored',
          'The interview changed while expanded fit was computing. Save the latest answers and try again.',
          'save_more_answers',
          true,
          runId,
        );
        await this.workflowIdempotencyService.complete({
          userId,
          operationName: 'analysis.expanded_fit',
          dedupeKey,
          runId,
          responseBody: stale,
        });
        return fail(stale);
      }

      interview.expandedFitAssessment = {
        ...expansion,
        originalVerdict: this.scoreToVerdict(expansion.originalScore),
        expandedVerdict: this.scoreToVerdict(expansion.expandedScore),
        requestHash,
      };

      let saved: Interview;
      try {
        saved = await this.interviewsRepo.save(interview);
      } catch (error) {
        if (this.isUniqueConflictError(error)) {
          const existing = await this.interviewsRepo.findOne({
            where: { id: interview.id, userId },
          });
          if (existing) {
            saved = existing;
          } else {
            const conflict = this.buildExpandedFitError(
              'artifact_write_conflict',
              'A concurrent expanded fit save conflicted with this request.',
              'retry_compute',
              true,
              runId,
            );
            await this.workflowIdempotencyService.complete({
              userId,
              operationName: 'analysis.expanded_fit',
              dedupeKey,
              runId,
              responseBody: conflict,
            });
            return fail(conflict);
          }
        } else {
          throw error;
        }
      }
      const payload = await this.buildInterviewResponse(saved);

      this.logger.log(
        `[expanded-fit] success runId=${runId} interviewRecordId=${id} baselineId=${interview.baselineId ?? 'missing'} baselineVersionId=${interview.baselineVersionId ?? 'missing'} jobId=${interview.jobId ?? 'missing'} answerCount=${answerCount} decisionCounts=${JSON.stringify(decisionCounts)} durationMs=${Date.now() - startedAt}`,
      );

      const success = {
        status: 'success',
        code: 'expanded_fit_ready',
        message: 'Expanded fit is ready.',
        retryable: false,
        nextAction: 'review_results',
        payload,
        runId,
        idempotency: idempotencyMeta,
      } as ExpandedFitComputeSuccess;

      await this.workflowIdempotencyService.complete({
        userId,
        operationName: 'analysis.expanded_fit',
        dedupeKey,
        runId,
        responseBody: success,
      });

      return success;
    } catch (error) {
      const classified = this.classifyExpandedFitFailure(error, runId);
      if (dedupeKey) {
        await this.workflowIdempotencyService.markFailure({
          userId,
          operationName: 'analysis.expanded_fit',
          dedupeKey,
          runId,
          status: classified.code === 'stale_request_ignored' ? 'STALE' : 'FAILED',
          errorCode: classified.code,
          errorMessage: classified.message,
        });
      }
      return fail(classified);
    }
  }

  async promoteAcceptedAdditions(
    id: string,
    userId: string,
  ): Promise<{
    baselineVersionId: string;
    baselineVersionHash: string | null;
    versionNumber: number | null;
  }> {
    const interview = await this.getInterviewRecordForUser(id, userId);

    if (!interview.baselineId?.trim()) {
      throw new BadRequestException({
        error: {
          code: 'invalid_promotion_state',
          message:
            'A linked baseline is required before promoted additions can be saved.',
        },
      });
    }

    const recommendedAdditions = Array.isArray(interview.recommendedAdditions)
      ? interview.recommendedAdditions
      : [];
    const acceptedIds = this.normalizeAcceptedAdditionIds(
      interview.acceptedAdditionIds ?? [],
    );

    if (!acceptedIds.length) {
      throw new BadRequestException({
        error: {
          code: 'invalid_promotion_state',
          message:
            'Select at least one accepted addition before promoting this baseline.',
        },
      });
    }

    const acceptedSet = new Set(acceptedIds);
    const acceptedAdditions = recommendedAdditions.filter((addition) =>
      acceptedSet.has(addition.id),
    );

    if (!acceptedAdditions.length) {
      throw new BadRequestException({
        error: {
          code: 'invalid_promotion_state',
          message:
            'The accepted additions are no longer available on this interview. Re-open the review step and try again.',
        },
      });
    }

    const promotion =
      await this.baselineVersionService.approveVerifiedAdditions(userId, {
        baselineId: interview.baselineId,
        interviewId: interview.id,
        additions: acceptedAdditions,
      });

    interview.promotedBaselineVersionId = promotion.baseline_version_id ?? null;

    await this.interviewsRepo.save(interview);

    return {
      baselineVersionId: promotion.baseline_version_id,
      baselineVersionHash: promotion.hash ?? null,
      versionNumber: promotion.version_number ?? null,
    };
  }

  async deleteInterviewRecord(
    id: string,
    userId: string,
  ): Promise<{ deleted: true; id: string }> {
    const interview = await this.getInterviewRecordForUser(id, userId);
    await this.interviewsRepo.remove(interview);
    return { deleted: true, id };
  }

  private isUniqueConflictError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const record = error as Record<string, unknown>;
    return String(record.code ?? '').trim() === '23505';
  }

  async createInterview(
    userId: string,
    dto: CreateInterviewRecordDto & {
      baselineId?: string | null;
      baselineVersionId?: string | null;
    },
  ): Promise<Interview> {
    const baselineVersionId = await this.resolveBaselineVersionIdFromCompatInput(
      dto,
    );

    return this.createInterviewRecord(userId, {
      ...dto,
      baselineVersionId,
      baselineId: dto.baselineId?.trim() || undefined,
    });
  }

  async getInterviewsForUser(userId: string): Promise<Interview[]> {
    return this.listInterviewRecordsForUser(userId);
  }

  async getInterviewById(
    userId: string,
    interviewId: string,
  ): Promise<Interview> {
    return this.getInterviewRecordForUser(interviewId, userId);
  }

  async startInterviewFromFitReview(
    userId: string,
    dto: {
      jobId?: string | null;
      baselineId?: string | null;
      baselineVersionId?: string | null;
    },
  ): Promise<Interview> {
    const jobId = this.requireJobId(dto.jobId ?? undefined);
    const baselineVersionId = await this.resolveBaselineVersionIdFromCompatInput(
      dto,
    );

    const existing = await this.interviewsRepo.findOne({
      where: { userId, jobId, baselineVersionId },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      return this.buildInterviewResponse(existing);
    }

    return this.createInterviewRecord(userId, {
      jobId,
      baselineId: dto.baselineId?.trim() || undefined,
      baselineVersionId,
    });
  }

  async saveInterviewResponses(
    id: string,
    userId: string,
    body: {
      responses?: unknown;
    },
  ): Promise<Interview> {
    const source = body?.responses;
    const responseItems = Array.isArray(source) ? source : [];

    const normalizedResponses = responseItems
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (!entry || typeof entry !== 'object') return null;

        const raw = entry as { response?: unknown };
        return typeof raw.response === 'string' ? raw.response : null;
      })
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (!normalizedResponses.length) {
      throw new BadRequestException('No responses provided');
    }

    return this.updateInterviewRecord(id, userId, {
      responses: normalizedResponses,
    });
  }
}
