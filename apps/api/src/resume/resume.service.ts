import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { Baseline } from '../baseline/baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
} from '../baseline/baseline-section.entity';
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
    @InjectRepository(BaselineBlockPolicy)
    private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>,
  ) {}

  private applyPoliciesToSections(
    sections: BaselineSection[],
    policies: BaselineBlockPolicy[],
  ) {
    if (!policies.length) {
      return [...sections].sort((a, b) => a.order - b.order);
    }

    const policyMap = new Map<string, BaselineBlockPolicy>(
      policies.map((policy) => [policy.baselineSectionId, policy]),
    );

    return [...sections]
      .map((section) => {
        const policy = policyMap.get(section.id);
        return {
          ...section,
          includePolicy: policy?.includePolicy ?? section.includePolicy,
          order: policy?.order ?? section.order,
          sectionType: section.sectionType ?? section.type,
        } as BaselineSection;
      })
      .sort((a, b) => a.order - b.order);
  }

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

    const policies = await this.baselineBlockPolicyRepository.find({
      where: { baselineVersionId: baselineVersion.id },
      relations: ['baselineSection'],
      order: { order: 'ASC' },
    });

    const sectionsWithPolicies = this.applyPoliciesToSections(
      baseline.sections ?? [],
      policies,
    );

    const sections = sectionsWithPolicies.map((section) => ({
      id: section.id,
      type: section.sectionType,
      title: section.title,
      content: section.content,
      includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
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
