import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InterviewResponse } from './interview-response.entity';
import { InterviewSession } from './interview-session.entity';

export type CreateInterviewSessionInput = {
  baselineId: string;
  jobId?: string | null;
};

export type CreateInterviewResponseInput = {
  question: string;
  response: string;
};

@Injectable()
export class InterviewsService {
  constructor(
    @InjectRepository(InterviewSession)
    private readonly sessionRepository: Repository<InterviewSession>,
    @InjectRepository(InterviewResponse)
    private readonly responseRepository: Repository<InterviewResponse>,
  ) {}

  async createSession(userId: string, payload: CreateInterviewSessionInput) {
    const session = this.sessionRepository.create({
      userId,
      baselineId: payload.baselineId.trim(),
      jobId: payload.jobId?.trim() || null,
      status: 'active',
    });

    return this.sessionRepository.save(session);
  }

  async addResponses(
    sessionId: string,
    userId: string,
    responses: CreateInterviewResponseInput[],
  ) {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Interview session not found');
    }

    const responseEntities = responses.map((entry) =>
      this.responseRepository.create({
        sessionId: session.id,
        question: entry.question.trim(),
        response: entry.response.trim(),
      }),
    );

    await this.responseRepository.save(responseEntities);

    return this.responseRepository.find({
      where: { sessionId: session.id },
      order: { createdAt: 'ASC' },
    });
  }

  async getSession(sessionId: string, userId: string) {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['responses'],
      order: { responses: { createdAt: 'ASC' } },
    });

    if (!session) {
      throw new NotFoundException('Interview session not found');
    }

    return session;
  }
}
