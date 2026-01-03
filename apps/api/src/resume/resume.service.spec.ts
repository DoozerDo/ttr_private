import { UnprocessableEntityException } from '@nestjs/common';
import { BaselineIncludePolicy, BaselineSectionType } from '../baseline/baseline-section.entity';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceAction, ComplianceFlagCode, ComplianceFlagSeverity } from '../compliance/compliance.types';
import { ResumeService } from './resume.service';

const mockBaseline = {
  id: 'baseline-1',
  userId: 'user-1',
  sections: [
    {
      id: 'section-1',
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Example Co',
      content: 'Delivered results with 10% uptime improvement.',
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
    },
  ],
};

const mockBaselineVersion = {
  id: 'baseline-version-1',
  baselineId: 'baseline-1',
  hash: 'hash-1',
};

const mockJob = {
  id: 'job-1',
  userId: 'user-1',
  company: 'Example Co',
  rawDescription: 'Job description',
};

const buildRepository = (overrides: Record<string, any> = {}) => ({
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn().mockResolvedValue([]),
  ...overrides,
});

const buildService = (
  fitScore: number,
  writingFlags: any[] = [],
  baselineVersionOverride: Record<string, any> | null = mockBaselineVersion,
  complianceOverride: Partial<ComplianceService> = {},
) => {
  const baselineRepository = buildRepository({
    findOne: jest.fn().mockResolvedValue(mockBaseline),
  });
  const baselineVersionRepository = buildRepository({
    findOne: jest.fn().mockResolvedValue(baselineVersionOverride),
  });
  const baselineBlockPolicyRepository = buildRepository({
    find: jest.fn().mockResolvedValue([]),
  });
  const jobsRepository = buildRepository({
    findOne: jest.fn().mockResolvedValue(mockJob),
  });
  const fitAssessmentRepository = buildRepository({
    findOne: jest.fn().mockResolvedValue({
      id: 'fit-1',
      overallScore: fitScore,
    }),
  });
  const complianceService = {
    enforceResumeWritingRules: jest.fn().mockReturnValue(writingFlags),
    validateAndAudit: jest.fn().mockResolvedValue({
      complianceFlags: writingFlags,
      blocked: writingFlags.length > 0,
      audit: { id: 'audit-1' },
    }),
    ...complianceOverride,
  } as unknown as ComplianceService;

  return {
    service: new ResumeService(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      baselineRepository,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      baselineVersionRepository,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      baselineBlockPolicyRepository,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      jobsRepository,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      fitAssessmentRepository,
      complianceService,
    ),
    complianceService,
  };
};

describe('ResumeService', () => {
  const request = {
    baselineId: 'baseline-1',
    baselineVersionId: 'baseline-version-1',
    jobId: 'job-1',
    oneTap: true,
  };

  it('rejects one-tap generation when fit score is below 92', async () => {
    const { service } = buildService(91);

    await expect(service.generateResume('user-1', request)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('allows one-tap generation when fit score is at least 92', async () => {
    const { service } = buildService(92);

    const result = await service.generateResume('user-1', request);

    expect(result.ok).toBe(true);
    expect(result.sections).toHaveLength(1);
  });

  it('exports DOCX content with headers and body', async () => {
    const { service } = buildService(95, []);

    const exportResult = await service.exportResume('user-1', request, 'docx');

    expect(exportResult.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(exportResult.buffer.byteLength).toBeGreaterThan(10);
    expect(exportResult.filename).toBe('resume.docx');
  });

  it('blocks generation when baseline hash is missing', async () => {
    const complianceService = {
      enforceResumeWritingRules: jest.fn().mockReturnValue([]),
      validateAndAudit: jest.fn().mockResolvedValue({
        complianceFlags: [
          {
            code: ComplianceFlagCode.MISSING_BASELINE_HASH,
            severity: ComplianceFlagSeverity.BLOCK,
            message: 'Baseline version hash is required.',
          },
        ],
        blocked: true,
        audit: { id: 'audit-1' },
      }),
    } as unknown as ComplianceService;

    const { service } = buildService(95, [], { ...mockBaselineVersion, hash: null }, complianceService);

    await expect(service.generateResume('user-1', request)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('audits resume export actions', async () => {
    const { service, complianceService } = buildService(95);

    await service.exportResume('user-1', request, 'pdf');

    expect((complianceService as any).validateAndAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ComplianceAction.RESUME_EXPORT,
        actorId: 'user-1',
        baselineVersion: expect.objectContaining({ id: 'baseline-version-1' }),
        job: expect.objectContaining({ id: 'job-1' }),
        outputHash: expect.any(String),
      }),
    );
  });
});
