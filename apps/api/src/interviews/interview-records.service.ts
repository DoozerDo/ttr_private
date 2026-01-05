import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { ComplianceFlagSeverity } from '../compliance/compliance.types';
import { GapDetectionService } from './gap-detection.service';
import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import { CreateInterviewRecordDto } from './dto/create-interview.dto';
import { UpdateInterviewRecordDto } from './dto/update-interview.dto';
import { Interview } from './interview.entity';
import {
  InterviewGap,
  InterviewQuestion,
  RecommendedAddition,
  RecommendedAdditionSource,
  RecommendedAdditionStatus,
} from './interview-types';
import { RecommendedAdditionsService } from './recommended-additions.service';

function normalizeStringArray(value?: unknown[]): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function normalizeGapList(value?: unknown[]): InterviewGap[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is InterviewGap => typeof entry === 'object' && entry !== null)
    : [];
}

function normalizeQuestionList(value?: unknown[]): InterviewQuestion[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is InterviewQuestion => typeof entry === 'object' && entry !== null)
    : [];
}

function normalizeAdditionStatus(value?: unknown): RecommendedAdditionStatus {
  return value === 'accepted' || value === 'rejected' ? value : 'proposed';
}

function normalizeAdditionSources(value?: unknown): RecommendedAdditionSource[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry): RecommendedAdditionSource | null => {
      if (!entry || typeof entry !== 'object') return null;

      const raw = entry as Partial<RecommendedAdditionSource>;

      const gapId = typeof raw.gapId === 'string' ? raw.gapId : undefined;
      const questionIndex = typeof raw.questionIndex === 'number' ? raw.questionIndex : undefined;
      const questionPrompt = typeof raw.questionPrompt === 'string' ? raw.questionPrompt : undefined;

      if (gapId === undefined && questionIndex === undefined && questionPrompt === undefined) {
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

function buildAdditionId(text: string, sources: RecommendedAdditionSource[]): string {
  return createHash('sha256').update(JSON.stringify({ text, sources })).digest('hex');
}

function normalizeRecommendedAdditions(value?: unknown[]): RecommendedAddition[] {
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
      const text = typeof addition.text === 'string' ? addition.text.trim() : '';
      if (!text) return null;

      const sources = normalizeAdditionSources(addition.sources);
      const status = normalizeAdditionStatus(addition.status);

      return {
        id: typeof addition.id === 'string' && addition.id ? addition.id : buildAdditionId(text, sources),
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
    private readonly gapDetectionService: GapDetectionService,
    private readonly interviewQuestionGenerator: InterviewQuestionGeneratorService,
    private readonly recommendedAdditionsService: RecommendedAdditionsService,
  ) {}

  private requireJobId(jobId?: string): string {
    const normalized = jobId?.trim();
    if (!normalized) throw new BadRequestException('jobId is required');
    return normalized;
  }

  private requireBaselineVersionId(baselineVersionId?: string): string {
    const normalized = baselineVersionId?.trim();
    if (!normalized) throw new BadRequestException('baselineVersionId is required');
    return normalized;
  }

  private hasBlockingCompliance(validationResults: Record<string, unknown> | undefined | null): boolean {
    if (!validationResults) return false;

    const blocked = Boolean((validationResults as { blocked?: boolean }).blocked);
    if (blocked) return true;

    const flags = (validationResults as { complianceFlags?: Array<{ severity?: string }> }).complianceFlags;
    if (!Array.isArray(flags)) return false;

    return flags.some((flag) => flag?.severity === ComplianceFlagSeverity.BLOCK);
  }

  async createInterviewRecord(userId: string, dto: CreateInterviewRecordDto): Promise<Interview> {
    const jobId = this.requireJobId(dto.jobId);
    const baselineVersionId = this.requireBaselineVersionId(dto.baselineVersionId);

    const detection = await this.gapDetectionService.detectGaps({
      userId,
      jobId,
      baselineVersionId,
    });

    const gapList = dto.gapList?.length ? normalizeGapList(dto.gapList) : detection.gaps;

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
      recommendedAdditions: normalizeRecommendedAdditions(dto.recommendedAdditions),
    });

    return this.interviewsRepo.save(interview);
  }

  async listInterviewRecordsForUser(userId: string): Promise<Interview[]> {
    return this.interviewsRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getInterviewRecordForUser(id: string, userId: string): Promise<Interview> {
    const interview = await this.interviewsRepo.findOne({
      where: { id, userId },
    });

    if (!interview) {
      throw new NotFoundException('Interview record not found');
    }

    return interview;
  }

  async updateInterviewRecord(id: string, userId: string, dto: UpdateInterviewRecordDto): Promise<Interview> {
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
      interview.recommendedAdditions = this.recommendedAdditionsService.generateFromResponses({
        responses: interview.responses,
        questions: interview.questions,
        gaps: interview.gapList,
      });
    }

    return this.interviewsRepo.save(interview);
  }

  async applyAdditionDecisions(id: string, userId: string, body: unknown): Promise<Interview> {
    const interview = await this.getInterviewRecordForUser(id, userId);

    const existing = Array.isArray(interview.recommendedAdditions) ? interview.recommendedAdditions : [];

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

    const acceptedSet = new Set(Array.isArray(payload.acceptedIds) ? payload.acceptedIds : []);
    const rejectedSet = new Set(Array.isArray(payload.rejectedIds) ? payload.rejectedIds : []);

    const statusById = new Map<string, RecommendedAdditionStatus>();
    for (const decision of decisionsList) {
      const idValue = typeof decision?.id === 'string' ? decision.id : '';
      const statusValue = decision?.status === 'accepted' || decision?.status === 'rejected' ? decision.status : null;
      if (idValue && statusValue) statusById.set(idValue, statusValue);
    }

    interview.recommendedAdditions = existing.map((addition) => {
      const nextStatus =
        statusById.get(addition.id) ??
        (acceptedSet.has(addition.id) ? 'accepted' : rejectedSet.has(addition.id) ? 'rejected' : undefined);

      return nextStatus ? { ...addition, status: nextStatus } : addition;
    });

    return this.interviewsRepo.save(interview);
  }

  async deleteInterviewRecord(id: string, userId: string): Promise<{ deleted: true; id: string }> {
    const interview = await this.getInterviewRecordForUser(id, userId);
    await this.interviewsRepo.remove(interview);
    return { deleted: true, id };
  }

  async createInterview(userId: string, dto: CreateInterviewRecordDto): Promise<Interview> {
    return this.createInterviewRecord(userId, dto);
  }

  async getInterviewsForUser(userId: string): Promise<Interview[]> {
    return this.listInterviewRecordsForUser(userId);
  }

  async getInterviewById(userId: string, interviewId: string): Promise<Interview> {
    return this.getInterviewRecordForUser(interviewId, userId);
  }
}
