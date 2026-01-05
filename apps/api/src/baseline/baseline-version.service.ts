import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { Interview } from '../interviews/interview.entity';
import { ComplianceFlagSeverity } from '../compliance/compliance.types';
import { ComplianceService } from '../compliance/compliance.service';
import {
  BaselineIncludePolicy,
  BaselineSection,
} from './baseline-section.entity';
import { Baseline } from './baseline.entity';
import { BaselineBlockPolicy } from './baseline-block-policy.entity';
import { BaselineVersion } from './baseline-version.entity';

type PolicyState = {
  baselineSectionId: string;
  includePolicy: BaselineIncludePolicy;
  order: number;
};

type ApproveAdditionsPayload = {
  baselineId: string;
  interviewId?: string;
  additions?: string[];
};

@Injectable()
export class BaselineVersionService {
  constructor(
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(BaselineSection)
    private readonly baselineSectionRepository: Repository<BaselineSection>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    @InjectRepository(BaselineBlockPolicy)
    private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>,
    @InjectRepository(Interview)
    private readonly interviewRepository: Repository<Interview>,
    private readonly complianceService: ComplianceService,
  ) {}

  private normalizePoliciesFromSections(sections: BaselineSection[]): PolicyState[] {
    return sections.map((section, index) => ({
      baselineSectionId: section.id,
      includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
      order: section.order ?? index,
    }));
  }

  private buildVersionHash(
    baselineHash: string | null,
    policies: PolicyState[],
    additions: string[],
  ) {
    const normalizedPolicies = [...policies]
      .map((policy) => ({
        id: policy.baselineSectionId,
        includePolicy: policy.includePolicy,
        order: policy.order,
      }))
      .sort((a, b) => {
        const delta = a.id.localeCompare(b.id);
        if (delta !== 0) return delta;
        return a.order - b.order;
      });

    const normalizedAdditions = [...additions].sort((a, b) => a.localeCompare(b));

    return createHash('sha256')
      .update(JSON.stringify({ baselineHash: baselineHash ?? null, policies: normalizedPolicies, additions: normalizedAdditions }))
      .digest('hex');
  }

  private normalizeAdditions(additions?: string[] | null) {
    if (!additions?.length) return [];
    return additions
      .map((entry) => entry?.trim())
      .filter((entry): entry is string => Boolean(entry));
  }

  async approveVerifiedAdditions(userId: string, payload: ApproveAdditionsPayload) {
    const baselineId = payload.baselineId?.trim();

    if (!baselineId) {
      throw new BadRequestException('baselineId is required');
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const additionsFromPayload = this.normalizeAdditions(payload.additions);

    const interviewId = payload.interviewId?.trim();
    const interview = interviewId
      ? await this.interviewRepository.findOne({
          where: { id: interviewId, userId },
        })
      : null;

    if (interviewId && !interview) {
      throw new NotFoundException('Interview not found');
    }

    if (interview?.baselineId && interview.baselineId !== baselineId) {
      throw new BadRequestException('Interview baseline does not match target baseline');
    }

    const additions = additionsFromPayload.length
      ? additionsFromPayload
      : this.normalizeAdditions(interview?.recommendedAdditions);

    if (!additions.length) {
      throw new BadRequestException('No verified additions supplied for promotion');
    }

    const latestVersion = await this.baselineVersionRepository.findOne({
      where: { baselineId },
      order: { versionNumber: 'DESC', createdAt: 'DESC' },
    });

    const sections = await this.baselineSectionRepository.find({
      where: { baselineId },
      order: { order: 'ASC' },
    });

    const technologyFlags = this.complianceService.enforceTechnologyConsistency({
      baselineSections: sections,
      generatedSections: additions.map((content, index) => ({
        title: `Addition ${index + 1}`,
        content,
      })),
    });

    const blockingTechnologyFlag = technologyFlags.find(
      (flag) => flag.severity === ComplianceFlagSeverity.BLOCK,
    );

    if (blockingTechnologyFlag) {
      throw new BadRequestException(blockingTechnologyFlag.message);
    }

    const existingPolicies = latestVersion
      ? await this.baselineBlockPolicyRepository.find({
          where: { baselineVersionId: latestVersion.id },
          order: { order: 'ASC' },
        })
      : [];

    const policyState: PolicyState[] =
      existingPolicies.length > 0
        ? existingPolicies.map((policy) => ({
            baselineSectionId: policy.baselineSectionId,
            includePolicy: policy.includePolicy,
            order: policy.order,
          }))
        : this.normalizePoliciesFromSections(sections);

    const nextVersionNumber = (latestVersion?.versionNumber ?? baseline.version ?? 0) + 1;

    const versionHash = this.buildVersionHash(baseline.hash, policyState, additions);

    const diffPayload = {
      added: additions,
      interviewId: interview?.id ?? null,
    };

    return this.baselineRepository.manager.transaction(async (manager) => {
      const newVersion = manager.create(BaselineVersion, {
        baselineId,
        versionNumber: nextVersionNumber,
        fileHash: versionHash,
        storagePath: baseline.storagePath,
        verifiedAdditions: additions,
        additionDiff: diffPayload,
        promotedFromInterviewId: interview?.id ?? null,
      });

      const savedVersion = await manager.save(newVersion);

      if (existingPolicies.length) {
        const newPolicies = existingPolicies.map((policy) =>
          manager.create(BaselineBlockPolicy, {
            ...policy,
            id: undefined,
            baselineVersionId: savedVersion.id,
          }),
        );

        await manager.save(newPolicies);
      }

      baseline.version = nextVersionNumber;
      await manager.save(baseline);

      return {
        baseline_version_id: savedVersion.id,
        version_number: savedVersion.versionNumber,
        hash: savedVersion.fileHash,
        diff: diffPayload,
      };
    });
  }
}
