import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineVersionService } from '../baseline/baseline-version.service';
import { AnalysisService } from '../analysis/analysis.service';
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

@Injectable()
export class InterviewRecordsService {
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
      decisions?: Array<{ id?: string; status?: RecommendedAdditionStatus }>;
      additions?: Array<{ id?: string; status?: RecommendedAdditionStatus }>;
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
      const idValue = typeof decision?.id === 'string' ? decision.id : '';
      const statusValue =
        decision?.status === 'accepted' || decision?.status === 'rejected'
          ? decision.status
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

  async computeExpandedFit(id: string, userId: string): Promise<Interview> {
    const interview = await this.getInterviewRecordForUser(id, userId);

    if (!interview.baselineId?.trim()) {
      throw new BadRequestException('baselineId is required');
    }

    if (!interview.jobId?.trim()) {
      throw new BadRequestException('jobId is required');
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
      throw new BadRequestException(
        'No additions available for expanded scoring',
      );
    }

    const baselineVersionNumber = await this.getBaselineVersionNumber(
      interview.baselineVersionId,
    );

    const expansion = await this.analysisService.runExpandedFitAssessment(
      userId,
      {
        jobId: interview.jobId,
        baselineId: interview.baselineId,
        baselineVersion: baselineVersionNumber,
        interviewId: interview.id,
        verifiedAdditions,
      },
    );

    interview.expandedFitAssessment = {
      ...expansion,
      originalVerdict: this.scoreToVerdict(expansion.originalScore),
      expandedVerdict: this.scoreToVerdict(expansion.expandedScore),
    };

    const saved = await this.interviewsRepo.save(interview);
    return this.buildInterviewResponse(saved);
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
      throw new BadRequestException('baselineId is required');
    }

    const recommendedAdditions = Array.isArray(interview.recommendedAdditions)
      ? interview.recommendedAdditions
      : [];
    const acceptedIds = this.normalizeAcceptedAdditionIds(
      interview.acceptedAdditionIds ?? [],
    );

    if (!acceptedIds.length) {
      throw new BadRequestException(
        'At least one accepted addition is required',
      );
    }

    const acceptedSet = new Set(acceptedIds);
    const acceptedAdditions = recommendedAdditions.filter((addition) =>
      acceptedSet.has(addition.id),
    );

    if (!acceptedAdditions.length) {
      throw new BadRequestException(
        'Accepted additions were not found on this interview',
      );
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
