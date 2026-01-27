import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { BaselineStatus, Baseline } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { ComplianceService } from '../compliance/compliance.service';
import type { ValidateAndAuditResult } from '../compliance/compliance.service';
import {
  ComplianceAction,
  ComplianceFlag,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
} from '../compliance/compliance.types';
import { AUTO_GENERATE_THRESHOLD } from '../config/autoGenerateThreshold';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { ResumeService, GenerateResumeRequest } from './resume.service';

const mockBaseline: Baseline = {
  id: 'baseline-1',
  userId: 'user-1',
  version: 1,
  originalFilename: 'resume.docx',
  mimeType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  storagePath: '/tmp/resume.docx',
  hash: null,
  status: BaselineStatus.ACTIVE,
  archivedAt: null,
  sections: [],
  versions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockBaselineVersion: BaselineVersion = {
  id: 'baseline-version-1',
  baseline: mockBaseline,
  baselineId: 'baseline-1',
  versionNumber: 3,
  fileHash: 'hash-1',
  allowedCompanies: [],
  allowedRoles: [],
  allowedTechnologies: [],
  allowedMetricTokens: [],
  verifiedAdditions: [],
  additionDiff: null,
  promotedFromInterviewId: null,
  blockPolicies: [],
  storagePath: '/tmp/version-1',
  createdAt: new Date(),
};

const mockJob: Job = {
  id: 'job-1',
  userId: 'user-1',
  company: 'Example Co',
  rawDescription: 'Job description',
  sourceUrl: null,
  sourceProviderId: null,
  sourceExternalId: null,
  canonicalUrl: null,
  dedupeHash: null,
  normalizedResponsibilities: [],
  normalizedRequirements: [],
  jdIngestionMethod: JobIngestionMethod.PASTE,
  jdParsedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
  isArchived: false,
};

const baseRequest: GenerateResumeRequest = {
  baselineId: 'baseline-1',
  baselineVersionId: 'baseline-version-1',
  jobId: 'job-1',
  oneTap: true,
};

type MockedComplianceService = jest.Mocked<ComplianceService>;

const buildRepository = <T>(
  overrides: Partial<Repository<T>> = {},
): Repository<T> =>
  ({
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    ...overrides,
  }) as unknown as Repository<T>;

const createComplianceServiceMock = (
  writingFlags: ComplianceFlag[],
  baselineVersionOverride: Partial<BaselineVersion> | null,
  override: Partial<MockedComplianceService> = {},
): MockedComplianceService => {
  const auditResult: ValidateAndAuditResult = {
    complianceFlags: writingFlags,
    blocked: writingFlags.length > 0,
    audit: {
      id: 'audit-1',
      baselineVersionId: baselineVersionOverride?.id ?? mockBaselineVersion.id,
      baselineVersionHash:
        baselineVersionOverride?.fileHash ??
        baselineVersionOverride?.hash ??
        mockBaselineVersion.fileHash,
      outputHash: '',
      action: ComplianceAction.RESUME_GENERATION,
      actorId: 'user-1',
      jobId: mockJob.id,
      createdAt: new Date().toISOString(),
    },
  };

  return {
    enforceResumeWritingRules: jest.fn().mockReturnValue(writingFlags),
    detectScopeInflation: jest.fn().mockReturnValue([]),
    validateAndAudit: jest.fn().mockResolvedValue(auditResult),
    ...override,
  } as MockedComplianceService;
};

const buildService = (
  fitScore: number,
  writingFlags: ComplianceFlag[] = [],
  baselineVersionOverride: Partial<BaselineVersion> | null = mockBaselineVersion,
  complianceOverride: Partial<MockedComplianceService> = {},
) => {
  const baselineRepository = buildRepository<Baseline>({
    findOne: jest.fn().mockResolvedValue(mockBaseline),
  });
  const baselineVersionRepository = buildRepository<BaselineVersion>({
    findOne: jest.fn().mockResolvedValue(baselineVersionOverride),
  });
  const baselineBlockPolicyRepository = buildRepository<BaselineBlockPolicy>({
    find: jest.fn().mockResolvedValue([]),
  });
  const jobsRepository = buildRepository<Job>({
    findOne: jest.fn().mockResolvedValue(mockJob),
  });
  const fitAssessmentRepository = buildRepository<FitAssessment>({
    findOne: jest.fn().mockResolvedValue({
      id: 'fit-1',
      overallScore: fitScore,
    } as FitAssessment),
  });

  const complianceService = createComplianceServiceMock(
    writingFlags,
    baselineVersionOverride,
    complianceOverride,
  );

  const service = new ResumeService(
    baselineRepository,
    baselineVersionRepository,
    baselineBlockPolicyRepository,
    jobsRepository,
    fitAssessmentRepository,
    complianceService,
  );

  return {
    service,
    complianceService,
  };
};

describe('ResumeService', () => {
  it('rejects one-tap generation when fit score is below the threshold', async () => {
    const { service } = buildService(AUTO_GENERATE_THRESHOLD - 1);

    await expect(
      service.generateResume('user-1', baseRequest),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('includes the threshold in the rejection response', async () => {
    const { service } = buildService(AUTO_GENERATE_THRESHOLD - 2);

    await expect(
      service.generateResume('user-1', baseRequest),
    ).rejects.toMatchObject({
      response: {
        error: {
          message: `One tap resume generation requires fit score >= ${AUTO_GENERATE_THRESHOLD}.`,
        },
      },
    });
  });

  it('requires a baselineVersionId for generation', async () => {
    const { service } = buildService(95);

    await expect(
      service.generateResume('user-1', {
        ...baseRequest,
        baselineVersionId: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows one-tap generation when score meets threshold', async () => {
    const { service } = buildService(AUTO_GENERATE_THRESHOLD);

    const result = await service.generateResume('user-1', baseRequest);
    expect(result.ok).toBe(true);
    expect(result.sections).toHaveLength(1);
  });

  it('returns draft quality when fit score is below threshold', async () => {
    const { service } = buildService(AUTO_GENERATE_THRESHOLD - 4);

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });
    expect(result.quality).toBe('draft');
  });

  it('returns optimized quality when fit score is sufficient', async () => {
    const { service } = buildService(AUTO_GENERATE_THRESHOLD + 2);

    const result = await service.generateResume('user-1', {
      ...baseRequest,
      oneTap: false,
    });
    expect(result.quality).toBe('optimized');
  });

  it('exports DOCX content with headers and audit details', async () => {
    const { service } = buildService(95, []);

    const exportResult = await service.exportResume(
      'user-1',
      baseRequest,
      'docx',
    );
    expect(exportResult.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(exportResult.buffer.byteLength).toBeGreaterThan(10);
    expect(exportResult.filename).toBe('resume.docx');
    expect(exportResult.auditId).toBe('audit-1');
    expect(exportResult.baselineVersionHash).toBe('hash-1');
  });

  it('blocks generation when baseline hash is missing', async () => {
    const complianceOverride: Partial<MockedComplianceService> = {
      validateAndAudit: jest.fn().mockResolvedValue({
        complianceFlags: [
          {
            code: ComplianceFlagCode.MISSING_BASELINE_HASH,
            severity: ComplianceFlagSeverity.BLOCK,
            message: 'Baseline version hash is required.',
          },
        ],
        blocked: true,
        audit: {
          id: 'audit-1',
          baselineVersionId: 'baseline-version-1',
          baselineVersionHash: null,
          outputHash: '',
          action: ComplianceAction.RESUME_GENERATION,
          actorId: 'user-1',
          jobId: 'job-1',
          createdAt: new Date().toISOString(),
        },
      } as ValidateAndAuditResult),
    };

    const { service } = buildService(
      95,
      [],
      { ...mockBaselineVersion, fileHash: null, hash: null },
      complianceOverride,
    );

    await expect(
      service.generateResume('user-1', baseRequest),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('audits resume export actions', async () => {
    const { service, complianceService } = buildService(95);

    await service.exportResume('user-1', baseRequest, 'pdf');

    expect(complianceService.validateAndAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ComplianceAction.RESUME_EXPORT,
        actorId: 'user-1',
        baselineVersion: expect.objectContaining({ id: 'baseline-version-1' }),
        job: expect.objectContaining({ id: 'job-1' }),
        outputHash: expect.any(String),
      }),
    );
  });

  it('blocks generation when invented metrics are flagged', async () => {
    const inventedFlag: ComplianceFlag[] = [
      {
        code: ComplianceFlagCode.INVENTED_METRIC,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Metric not in baseline.',
      },
    ];
    const { service } = buildService(95, inventedFlag);

    await expect(
      service.generateResume('user-1', baseRequest),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('blocks export when compliance flags block', async () => {
    const complianceOverride: Partial<MockedComplianceService> = {
      detectScopeInflation: jest.fn().mockReturnValue([]),
      validateAndAudit: jest.fn().mockResolvedValue({
        complianceFlags: [
          {
            code: ComplianceFlagCode.INVENTED_METRIC,
            severity: ComplianceFlagSeverity.BLOCK,
          },
        ],
        blocked: true,
        audit: {
          id: 'audit-2',
          baselineVersionId: 'baseline-version-1',
          baselineVersionHash: 'hash-1',
          outputHash: '',
          action: ComplianceAction.RESUME_EXPORT,
          actorId: 'user-1',
          jobId: 'job-1',
          createdAt: new Date().toISOString(),
        },
      } as ValidateAndAuditResult),
    };
    const { service } = buildService(
      95,
      [],
      mockBaselineVersion,
      complianceOverride,
    );

    await expect(
      service.exportResume('user-1', baseRequest, 'docx'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('blocks generation when scope inflation is detected', async () => {
    const scopeFlag: ComplianceFlag[] = [
      {
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Scope exceeds baseline.',
      },
    ];

    const { service } = buildService(95, [], mockBaselineVersion, {
      detectScopeInflation: jest.fn().mockReturnValue(scopeFlag),
      validateAndAudit: jest.fn().mockResolvedValue({
        complianceFlags: scopeFlag,
        blocked: true,
        audit: {
          id: 'audit-3',
          baselineVersionId: 'baseline-version-1',
          baselineVersionHash: 'hash-1',
          outputHash: '',
          action: ComplianceAction.RESUME_GENERATION,
          actorId: 'user-1',
          jobId: 'job-1',
          createdAt: new Date().toISOString(),
        },
      } as ValidateAndAuditResult),
    });

    await expect(
      service.generateResume('user-1', baseRequest),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
