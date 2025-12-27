import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { Job } from '../jobs/job.entity';
import { CoverLetter } from './cover-letter.entity';
import { GenerateCoverLetterDto } from './dto/generate-cover-letter.dto';
import {
  AllowedBaselineBlock,
  CoverLetterJobContext,
} from './generators/cover-letter-generator.interface';
import { TemplateCoverLetterGenerator } from './generators/template-cover-letter.generator';

@Injectable()
export class CoverLettersService {
  private readonly coverLetterRepository: Repository<CoverLetter>;
  private readonly baselineRepository: Repository<Baseline>;
  private readonly baselineVersionRepository: Repository<BaselineVersion>;
  private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>;
  private readonly jobRepository: Repository<Job>;
  private readonly generator = new TemplateCoverLetterGenerator();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    this.coverLetterRepository = this.dataSource.getRepository(CoverLetter);
    this.baselineRepository = this.dataSource.getRepository(Baseline);
    this.baselineVersionRepository =
      this.dataSource.getRepository(BaselineVersion);
    this.baselineBlockPolicyRepository = this.dataSource.getRepository(
      BaselineBlockPolicy,
    );
    this.jobRepository = this.dataSource.getRepository(Job);
  }

  async generateCoverLetter(userId: string, input: GenerateCoverLetterDto) {
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: input.baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const job = await this.jobRepository.findOne({
      where: { id: input.jobId, userId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: { baselineId: baseline.id },
      order: { versionNumber: 'DESC', createdAt: 'DESC' },
    });

    const policies = baselineVersion
      ? await this.baselineBlockPolicyRepository.find({
          where: { baselineVersionId: baselineVersion.id },
          relations: ['baselineSection'],
          order: { order: 'ASC' },
        })
      : [];

    const sections = this.applyPoliciesToSections(
      baseline.sections ?? [],
      policies,
    );

    const allowedSections = sections.filter(
      (section) => section.includePolicy !== BaselineIncludePolicy.NEVER,
    );

    const allowedBlocks = this.mapToAllowedBlocks(allowedSections);
    const generationInputsHash = this.computeGenerationInputsHash(
      baseline.id,
      job.id,
      allowedBlocks,
      {
        id: job.id,
        title: job.title ?? null,
        company: job.company ?? null,
        responsibilities: job.normalizedResponsibilities ?? [],
        requirements: job.normalizedRequirements ?? [],
      },
    );

    const { content } = this.generator.generate({
      baselineId: baseline.id,
      jobId: job.id,
      allowedBaselineBlocks: allowedBlocks,
      job: {
        id: job.id,
        title: job.title ?? null,
        company: job.company ?? null,
        responsibilities: job.normalizedResponsibilities ?? [],
        requirements: job.normalizedRequirements ?? [],
      },
      maxWords: input.maxWords,
      tone: input.tone,
    });

    const coverLetter = this.coverLetterRepository.create({
      userId,
      baselineId: baseline.id,
      jobId: job.id,
      generatorType: 'template',
      generatorVersion: 'v1',
      content,
      generationInputsHash,
    });

    return this.coverLetterRepository.save(coverLetter);
  }

  async listCoverLetters(userId: string) {
    return this.coverLetterRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getCoverLetter(userId: string, id: string) {
    const coverLetter = await this.coverLetterRepository.findOne({
      where: { id, userId },
    });

    if (!coverLetter) {
      throw new NotFoundException('Cover letter not found');
    }

    return coverLetter;
  }

  async deleteCoverLetter(userId: string, id: string) {
    const coverLetter = await this.coverLetterRepository.findOne({
      where: { id, userId },
    });

    if (!coverLetter) {
      throw new NotFoundException('Cover letter not found');
    }

    await this.coverLetterRepository.remove(coverLetter);

    return { deleted: true, id };
  }

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

  private mapToAllowedBlocks(
    sections: BaselineSection[],
  ): AllowedBaselineBlock[] {
    return sections.map((section, index) => ({
      id: section.id,
      title: section.title ?? null,
      content: this.sanitizeContent(section.content),
      includePolicy:
        section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
      order: section.order ?? index,
      sectionType:
        section.sectionType ?? section.type ?? BaselineSectionType.OTHER,
    }));
  }

  private sanitizeContent(content?: string | null) {
    if (!content) {
      return '';
    }

    return content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private computeGenerationInputsHash(
    baselineId: string,
    jobId: string,
    allowedBlocks: AllowedBaselineBlock[],
    job: CoverLetterJobContext,
  ) {
    const normalizedBaseline = allowedBlocks
      .map((block) => ({
        id: block.id,
        title: block.title ?? null,
        order: block.order,
        includePolicy: block.includePolicy,
        sectionType: block.sectionType,
        content: block.content,
      }))
      .sort((a, b) => a.order - b.order);

    const normalizedJob = {
      id: job.id,
      title: job.title ?? null,
      company: job.company ?? null,
      responsibilities: (job.responsibilities ?? []).map((item) =>
        (item ?? '').trim(),
      ),
      requirements: (job.requirements ?? []).map((item) =>
        (item ?? '').trim(),
      ),
    };

    const payload = {
      baselineId,
      jobId,
      baseline: normalizedBaseline,
      job: normalizedJob,
    };

    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}
