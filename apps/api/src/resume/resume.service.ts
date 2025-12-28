import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { Baseline } from '../baseline/baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
} from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceAction } from '../compliance/compliance.types';
import { Job } from '../jobs/job.entity';

export type GenerateResumeRequest = {
  baselineId: string;
  baselineVersionId?: string;
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
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
    private readonly complianceService: ComplianceService,
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
    const baselineId = request.baselineId?.trim();
    const baselineVersionId = request.baselineVersionId?.trim();
    const jobId = request.jobId?.trim();

    if (!baselineId) {
      throw new BadRequestException('baselineId is required');
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    let targetBaselineVersionId = baselineVersionId;

    if (!targetBaselineVersionId) {
      const latestVersion = await this.baselineVersionRepository.findOne({
        where: { baselineId: baseline.id },
        order: { versionNumber: 'DESC', createdAt: 'DESC' },
      });

      targetBaselineVersionId = latestVersion?.id;
    }

    if (!targetBaselineVersionId) {
      throw new NotFoundException('Baseline version not found');
    }

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: { id: targetBaselineVersionId, baselineId: baseline.id },
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

    const job = jobId
      ? await this.jobsRepository.findOne({
          where: { id: jobId, userId },
        })
      : null;

    if (jobId && !job) {
      throw new NotFoundException('Job not found');
    }

    const outputHash = createHash('sha256')
      .update(JSON.stringify(sections))
      .digest('hex');

    const { complianceFlags, blocked, audit } =
      await this.complianceService.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: userId,
        baselineVersion,
        job,
        outputHash,
        scopeInflationDetected: sections.some(
          (section) => section.includePolicy === BaselineIncludePolicy.NEVER,
        ),
      });

    if (blocked) {
      throw new UnprocessableEntityException({
        error: {
          code: 'unprocessable',
          message: 'Compliance validation failed.',
          details: { compliance_flags: complianceFlags },
        },
      });
    }

    return {
      ok: true,
      baselineId: baseline.id,
      baselineVersionId: baselineVersion.id,
      jobId: jobId ?? null,
      sections,
      compliance_flags: complianceFlags,
      audit_id: audit.id,
    };
  }
}
