import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from './job.entity';

export type CreateJobInput = {
  title?: string | null;
  company?: string | null;
  rawDescription: string;
};

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
  ) {}

  async createJob(userId: string, payload: CreateJobInput) {
    const job = this.jobRepository.create({
      userId,
      title: payload.title?.trim() || null,
      company: payload.company?.trim() || null,
      rawDescription: payload.rawDescription.trim(),
    });

    return this.jobRepository.save(job);
  }

  async listJobsForUser(userId: string) {
    return this.jobRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getJobForUser(id: string, userId: string) {
    const job = await this.jobRepository.findOne({ where: { id, userId } });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }
}
