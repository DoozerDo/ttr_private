import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InterviewResponse } from './interview-response.entity';
import { InterviewSession } from './interview-session.entity';
import { CreateInterviewResponseDto } from './dto/create-interview-response.dto';

// LEGACY COMPATIBILITY: not used by the active beta path.
// Canonical beta interview flow is implemented in InterviewRecordsService.
export type CreateInterviewDto = {
  baselineId?: string;
  jobId?: string | null;
  date?: string;
  type?: string;
};

export type UpdateInterviewDto = Partial<CreateInterviewDto> & {
  status?: string;
};

@Injectable()
export class InterviewsService {
  constructor(
    @InjectRepository(InterviewSession)
    private readonly interviewRepository: Repository<InterviewSession>,
    @InjectRepository(InterviewResponse)
    private readonly interviewResponseRepository: Repository<InterviewResponse>,
  ) {}

  private validateDate(date?: string | null) {
    if (!date?.trim()) {
      throw new BadRequestException('Interview date is required.');
    }
  }

  private validateType(type?: string | null) {
    if (type !== undefined && !type?.trim()) {
      throw new BadRequestException('Interview type is required.');
    }
  }

  private validateBaselineId(baselineId?: string | null) {
    if (!baselineId?.trim()) {
      throw new BadRequestException('Baseline ID is required.');
    }
  }

  private validateJobId(jobId?: string | null) {
    if (!jobId?.trim()) {
      throw new BadRequestException('Job ID is required.');
    }
  }

  async createInterview(userId: string, dto: CreateInterviewDto) {
    this.validateDate(dto.date ?? null);
    this.validateType(dto.type ?? null);
    this.validateBaselineId(dto.baselineId ?? null);

    const interview = this.interviewRepository.create({
      userId,
      baselineId: dto.baselineId!.trim(),
      jobId: dto.jobId?.trim() || null,
      status: dto.type?.trim() || 'scheduled',
    });

    if (dto.date) {
      interview.createdAt = new Date(dto.date);
    }

    return this.interviewRepository.save(interview);
  }

  async listInterviewsForUser(userId: string) {
    return this.interviewRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async startInterviewFromFitReview(
    userId: string,
    dto: { jobId?: string | null; baselineId?: string | null },
  ) {
    this.validateJobId(dto.jobId ?? null);
    this.validateBaselineId(dto.baselineId ?? null);

    const jobId = dto.jobId!.trim();
    const baselineId = dto.baselineId!.trim();

    const existing = await this.interviewRepository.findOne({
      where: { userId, jobId },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      return existing;
    }

    const session = this.interviewRepository.create({
      userId,
      jobId,
      baselineId,
      status: 'active',
    });

    return this.interviewRepository.save(session);
  }

  async getInterviewForUser(id: string, userId: string) {
    const interview = await this.interviewRepository.findOne({
      where: { id, userId },
    });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    return interview;
  }

  async updateInterview(id: string, userId: string, dto: UpdateInterviewDto) {
    const interview = await this.getInterviewForUser(id, userId);

    if (dto.date !== undefined) {
      this.validateDate(dto.date ?? null);
      interview.createdAt = new Date(dto.date);
    }

    if (dto.type !== undefined) {
      this.validateType(dto.type ?? null);
      interview.status = dto.type?.trim() || interview.status;
    }

    if (dto.baselineId !== undefined) {
      this.validateBaselineId(dto.baselineId ?? null);
      interview.baselineId = dto.baselineId?.trim() || interview.baselineId;
    }

    if (dto.jobId !== undefined) {
      interview.jobId = dto.jobId?.trim() || null;
    }

    if (dto.status !== undefined) {
      interview.status = dto.status;
    }

    return this.interviewRepository.save(interview);
  }

  async deleteInterview(id: string, userId: string) {
    const interview = await this.getInterviewForUser(id, userId);

    await this.interviewRepository.remove(interview);

    return { deleted: true, id };
  }

  async createInterviewResponse(
    sessionId: string,
    userId: string,
    dto: CreateInterviewResponseDto,
  ) {
    const session = await this.interviewRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Interview not found');
    }

    const response = this.interviewResponseRepository.create({
      sessionId: session.id,
      question: dto.question,
      response: dto.response,
    });

    return this.interviewResponseRepository.save(response);
  }
}
