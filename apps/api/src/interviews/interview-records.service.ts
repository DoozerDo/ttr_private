import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateInterviewRecordDto } from './dto/create-interview.dto';
import { UpdateInterviewRecordDto } from './dto/update-interview.dto';
import { Interview } from './interview.entity';

@Injectable()
export class InterviewRecordsService {
  constructor(
    @InjectRepository(Interview)
    private readonly interviewRepository: Repository<Interview>,
  ) {}

  private sanitizeStringArray(values?: string[]) {
    return (values ?? []).map((value) => value.trim()).filter(Boolean);
  }

  async createInterviewRecord(userId: string, dto: CreateInterviewRecordDto) {
    if (!dto.jobId?.trim()) {
      throw new BadRequestException('Job ID is required.');
    }

    const interview = this.interviewRepository.create({
      userId,
      jobId: dto.jobId.trim(),
      gapList: this.sanitizeStringArray(dto.gapList),
      questions: this.sanitizeStringArray(dto.questions),
      responses: this.sanitizeStringArray(dto.responses),
      validationResults: dto.validationResults ?? {},
      recommendedAdditions: this.sanitizeStringArray(dto.recommendedAdditions),
    });

    return this.interviewRepository.save(interview);
  }

  async listInterviewRecordsForUser(userId: string) {
    return this.interviewRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getInterviewRecordForUser(id: string, userId: string) {
    const interview = await this.interviewRepository.findOne({ where: { id, userId } });

    if (!interview) {
      throw new NotFoundException('Interview not found');
    }

    return interview;
  }

  async updateInterviewRecord(
    id: string,
    userId: string,
    dto: UpdateInterviewRecordDto,
  ) {
    const interview = await this.getInterviewRecordForUser(id, userId);

    if (dto.jobId !== undefined) {
      if (!dto.jobId?.trim()) {
        throw new BadRequestException('Job ID is required.');
      }
      interview.jobId = dto.jobId.trim();
    }

    if (dto.gapList !== undefined) {
      interview.gapList = this.sanitizeStringArray(dto.gapList);
    }

    if (dto.questions !== undefined) {
      interview.questions = this.sanitizeStringArray(dto.questions);
    }

    if (dto.responses !== undefined) {
      interview.responses = this.sanitizeStringArray(dto.responses);
    }

    if (dto.validationResults !== undefined) {
      interview.validationResults = dto.validationResults ?? {};
    }

    if (dto.recommendedAdditions !== undefined) {
      interview.recommendedAdditions = this.sanitizeStringArray(dto.recommendedAdditions);
    }

    return this.interviewRepository.save(interview);
  }

  async deleteInterviewRecord(id: string, userId: string) {
    const interview = await this.getInterviewRecordForUser(id, userId);

    await this.interviewRepository.remove(interview);

    return { deleted: true, id };
  }
}
