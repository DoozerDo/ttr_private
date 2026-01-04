import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GapDetectionService } from './gap-detection.service';
import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import { CreateInterviewRecordDto } from './dto/create-interview.dto';
import { UpdateInterviewRecordDto } from './dto/update-interview.dto';
import { Interview } from './interview.entity';
import { InterviewGap, InterviewQuestion } from './interview-types';

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

@Injectable()
export class InterviewRecordsService {
  constructor(
    @InjectRepository(Interview)
    private readonly interviewsRepo: Repository<Interview>,
    private readonly gapDetectionService: GapDetectionService,
    private readonly interviewQuestionGenerator: InterviewQuestionGeneratorService,
  ) {}

  private requireJobId(jobId?: string): string {
    const normalized = jobId?.trim();

    if (!normalized) {
      throw new BadRequestException('jobId is required');
    }

    return normalized;
  }

  private requireBaselineVersionId(baselineVersionId?: string): string {
    const normalized = baselineVersionId?.trim();

    if (!normalized) {
      throw new BadRequestException('baselineVersionId is required');
    }

    return normalized;
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
      recommendedAdditions: normalizeStringArray(dto.recommendedAdditions),
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

  async updateInterviewRecord(
    id: string,
    userId: string,
    dto: UpdateInterviewRecordDto,
  ): Promise<Interview> {
    const interview = await this.getInterviewRecordForUser(id, userId);

    if (dto.jobId !== undefined) {
      const jobId = dto.jobId.trim();

      if (!jobId) {
        throw new BadRequestException('jobId cannot be empty');
      }

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

    if (dto.recommendedAdditions !== undefined) {
      interview.recommendedAdditions = normalizeStringArray(dto.recommendedAdditions);
    }

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
