import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';

export type GenerateResumeRequest = {
  baselineId: string;
  baselineVersionId: string;
  jobId?: string | null;
};

@Injectable()
export class ResumeService {
  constructor(
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
  ) {}

  async generateResume(userId: string, request: GenerateResumeRequest) {
    if (!request.baselineId) {
      throw new BadRequestException('baselineId is required');
    }

    if (!request.baselineVersionId) {
      throw new BadRequestException('baselineVersionId is required');
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: request.baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: { id: request.baselineVersionId, baselineId: baseline.id },
    });

    if (!baselineVersion) {
      throw new NotFoundException('Baseline version not found');
    }

    const sections = (baseline.sections ?? []).map((section) => ({
      id: section.id,
      type: section.sectionType,
      title: section.title,
      content: section.content,
      includePolicy: section.includePolicy,
      order: section.order,
      source: 'baseline',
    }));

    return {
      ok: true,
      baselineId: baseline.id,
      baselineVersionId: baselineVersion.id,
      jobId: request.jobId ?? null,
      sections,
    };
  }
}
