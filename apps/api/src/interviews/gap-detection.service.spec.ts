import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BaselineIncludePolicy, BaselineSection } from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { GapDetectionService } from './gap-detection.service';
import { Job } from '../jobs/job.entity';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';

describe('GapDetectionService', () => {
  const createMockRepository = () => ({
    findOne: jest.fn(),
    find: jest.fn(),
  });

  const createService = (
    jobRepository = createMockRepository(),
    baselineSectionRepository = createMockRepository(),
    baselineVersionRepository = createMockRepository(),
    baselineBlockPolicyRepository = createMockRepository(),
  ) =>
    new GapDetectionService(
      jobRepository as never,
      baselineSectionRepository as never,
      baselineVersionRepository as never,
      baselineBlockPolicyRepository as never,
    );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('detects gaps only when baseline coverage is weak', async () => {
    const jobRepository = createMockRepository();
    const baselineVersionRepository = createMockRepository();
    const baselineSectionRepository = createMockRepository();
    const baselineBlockPolicyRepository = createMockRepository();

    const job: Job = {
      id: 'job-1',
      userId: 'user-1',
      title: null,
      company: null,
      rawDescription: 'sample',
      sourceUrl: null,
      normalizedRequirements: ['Hands-on Kubernetes administration', 'Lead cross-functional teams'],
      normalizedResponsibilities: [],
      jdIngestionMethod: 'PASTE' as never,
      jdParsedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const baseline: Baseline = {
      id: 'baseline-1',
      userId: 'user-1',
      version: 1,
      originalFilename: 'file.pdf',
      mimeType: 'application/pdf',
      storagePath: '/tmp/file.pdf',
      hash: null,
      sections: [],
      versions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const baselineVersion: BaselineVersion = {
      id: 'baseline-version-1',
      baselineId: baseline.id,
      baseline,
      blockPolicies: [],
      fileHash: null,
      storagePath: '/tmp/file.pdf',
      versionNumber: 1,
      createdAt: new Date(),
      hash: null,
    };

    jobRepository.findOne.mockResolvedValue(job);
    baselineVersionRepository.findOne.mockResolvedValue(baselineVersion);
    baselineSectionRepository.find.mockResolvedValue([
      {
        id: 'section-1',
        baselineId: baseline.id,
        baseline,
        sectionType: 'EXPERIENCE' as never,
        title: 'Experience',
        content: 'Implemented Kubernetes clusters and automation',
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        type: 'EXPERIENCE' as never,
        orderIndex: 1,
      } as unknown as BaselineSection,
    ]);
    baselineBlockPolicyRepository.find.mockResolvedValue([]);

    const service = createService(jobRepository, baselineSectionRepository, baselineVersionRepository, baselineBlockPolicyRepository);

    const result = await service.detectGaps({
      userId: 'user-1',
      jobId: job.id,
      baselineVersionId: baselineVersion.id,
    });

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].domain).toBe('leadership');
    expect(result.gaps[0].baselineExcerpt).toBeNull();
    expect(result.gaps[0].jdExcerpt).toBe('Lead cross-functional teams');
  });

  it('throws when required identifiers are missing', async () => {
    const service = createService();

    await expect(
      service.detectGaps({ userId: 'user-1', jobId: '', baselineVersionId: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates job and baseline ownership', async () => {
    const jobRepository = createMockRepository();
    const baselineVersionRepository = createMockRepository();
    const service = createService(jobRepository, createMockRepository(), baselineVersionRepository);

    jobRepository.findOne.mockResolvedValue(null);

    await expect(
      service.detectGaps({ userId: 'user-1', jobId: 'job-1', baselineVersionId: 'bv-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    jobRepository.findOne.mockResolvedValue({
      id: 'job-1',
      userId: 'user-1',
      rawDescription: '',
      normalizedRequirements: [],
      normalizedResponsibilities: [],
    } as Job);

    baselineVersionRepository.findOne.mockResolvedValue({
      id: 'bv-1',
      baselineId: 'b-1',
      baseline: { userId: 'other-user' } as Baseline,
    } as BaselineVersion);

    await expect(
      service.detectGaps({ userId: 'user-1', jobId: 'job-1', baselineVersionId: 'bv-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
