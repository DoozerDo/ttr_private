import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Application, ApplicationStage } from './application.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

export type ListApplicationsFilters = {
  stage?: ApplicationStage;
  company?: string;
};

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
  ) {}

  async createApplication(userId: string, dto: CreateApplicationDto) {
    if (!dto.company?.trim()) {
      throw new BadRequestException('Company is required.');
    }
    if (!dto.title?.trim()) {
      throw new BadRequestException('Title is required.');
    }

    const application = this.applicationRepository.create({
      userId,
      jobId: dto.jobId || null,
      company: dto.company.trim(),
      title: dto.title.trim(),
      appliedDate: dto.appliedDate ? new Date(dto.appliedDate) : null,
      fitScore: dto.fitScore ?? null,
      stage: dto.stage ?? ApplicationStage.SAVED,
      notes: dto.notes?.trim() || null,
      sourceUrl: dto.sourceUrl?.trim() || null,
    });

    return this.applicationRepository.save(application);
  }

  async listApplicationsForUser(userId: string, filters?: ListApplicationsFilters) {
    const queryBuilder = this.applicationRepository
      .createQueryBuilder('application')
      .where('application.userId = :userId', { userId });

    if (filters?.stage) {
      queryBuilder.andWhere('application.stage = :stage', { stage: filters.stage });
    }

    if (filters?.company) {
      queryBuilder.andWhere('LOWER(application.company) LIKE LOWER(:company)', {
        company: `%${filters.company}%`,
      });
    }

    queryBuilder.orderBy('application.createdAt', 'DESC');

    return queryBuilder.getMany();
  }

  async getApplicationForUser(id: string, userId: string) {
    const application = await this.applicationRepository.findOne({
      where: { id, userId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return application;
  }

  async updateApplication(id: string, userId: string, dto: UpdateApplicationDto) {
    const application = await this.getApplicationForUser(id, userId);

    if (dto.company !== undefined) application.company = dto.company.trim();
    if (dto.title !== undefined) application.title = dto.title.trim();
    if (dto.jobId !== undefined) application.jobId = dto.jobId || null;
    if (dto.appliedDate !== undefined) {
      application.appliedDate = dto.appliedDate ? new Date(dto.appliedDate) : null;
    }
    if (dto.fitScore !== undefined) application.fitScore = dto.fitScore;
    if (dto.stage !== undefined) application.stage = dto.stage;
    if (dto.notes !== undefined) application.notes = dto.notes?.trim() || null;
    if (dto.sourceUrl !== undefined) application.sourceUrl = dto.sourceUrl?.trim() || null;

    return this.applicationRepository.save(application);
  }

  async deleteApplication(id: string, userId: string) {
    const application = await this.getApplicationForUser(id, userId);

    await this.applicationRepository.remove(application);

    return { deleted: true, id };
  }
}
