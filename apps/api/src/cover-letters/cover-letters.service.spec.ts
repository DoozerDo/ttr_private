import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaselineIncludePolicy, BaselineSectionType } from '../baseline/baseline-section.entity';
import { ComplianceFlagCode, ComplianceFlagSeverity } from '../compliance/compliance.types';
import { CoverLettersService } from './cover-letters.service';

type MockRepository<T extends Record<string, any>> = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  remove: jest.Mock;
};

function buildRepository<T extends Record<string, any>>(initial?: T): MockRepository<T> {
  let saved = initial;

  return {
    findOne: jest.fn(async () => saved ?? null),
    find: jest.fn(async () => []),
    create: jest.fn((payload: Partial<T>) => ({ ...payload } as T)),
    save: jest.fn(async (payload: T) => {
      saved = { ...payload, id: payload['id'] ?? 'saved-id', createdAt: new Date(), updatedAt: new Date() } as T;
      return saved as T;
    }),
    remove: jest.fn(async (payload: T) => payload),
  };
}

describe('CoverLettersService', () => {
  const coverLetterRepository = buildRepository<any>();
  const baselineRepository = buildRepository<any>({
    id: 'baseline-1',
    userId: 'user-1',
    sections: [
      {
        id: 'section-1',
        title: 'Experience',
        content: 'Delivered 15% efficiency improvement with verified metrics.',
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 0,
        sectionType: BaselineSectionType.EXPERIENCE,
      },
    ],
  });
  const baselineVersionRepository = buildRepository<any>({
    id: 'baseline-version-1',
    baselineId: 'baseline-1',
    hash: 'baseline-hash',
  });
  const baselineBlockPolicyRepository = buildRepository<any>();
  const jobRepository = buildRepository<any>({
    id: 'job-1',
    userId: 'user-1',
    title: 'Program Manager',
    company: 'Acme Corp',
    normalizedResponsibilities: ['Improve processes by 10%.'],
    normalizedRequirements: ['Deliver measurable impact.'],
  });

  const complianceService = {
    enforceResumeWritingRules: jest.fn().mockReturnValue([]),
    detectScopeInflation: jest.fn().mockReturnValue([]),
    validateAndAudit: jest.fn(async (ctx: any) => ({
      complianceFlags: ctx.extraFlags ?? [],
      blocked: (ctx.extraFlags ?? []).some(
        (flag: { severity: ComplianceFlagSeverity }) => flag.severity === ComplianceFlagSeverity.BLOCK,
      ),
      audit: { id: 'audit-1' },
    })),
  };

  const dataSource = {
    getRepository: jest.fn((entity) => {
      switch ((entity as any)?.name) {
        case 'CoverLetter':
          return coverLetterRepository;
        case 'Baseline':
          return baselineRepository;
        case 'BaselineVersion':
          return baselineVersionRepository;
        case 'BaselineBlockPolicy':
          return baselineBlockPolicyRepository;
        case 'Job':
          return jobRepository;
        default:
          throw new Error(`Unexpected repository request: ${(entity as any)?.name}`);
      }
    }),
  } as unknown as DataSource;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists a chosen closing template and reuses it for the next generation', async () => {
    const service = new CoverLettersService(dataSource, complianceService as any);

    await service.generateCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
      closingTemplateKey: 'collaborative',
    });

    expect(coverLetterRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ closingTemplateKey: 'collaborative' }),
    );

    // Simulate subsequent call without providing a template key.
    const second = await service.generateCoverLetter('user-1', {
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      jobId: 'job-1',
    });

    expect(second.closingTemplateKey).toBe('collaborative');
    expect(second.audit_id).toBe('audit-1');
  });

  it('blocks invented metrics through compliance checks', async () => {
    complianceService.enforceResumeWritingRules.mockReturnValueOnce([
      {
        code: ComplianceFlagCode.INVENTED_METRIC,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Metric not found in baseline.',
      },
    ]);

    const service = new CoverLettersService(dataSource, complianceService as any);

    await expect(
      service.generateCoverLetter('user-1', {
        baselineId: 'baseline-1',
        baselineVersionId: 'baseline-version-1',
        jobId: 'job-1',
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(complianceService.validateAndAudit).toHaveBeenCalled();
  });

  it('blocks cover letter generation when scope inflation is detected', async () => {
    complianceService.detectScopeInflation.mockReturnValueOnce([
      {
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Scope exceeds baseline.',
      },
    ]);

    const service = new CoverLettersService(dataSource, complianceService as any);

    await expect(
      service.generateCoverLetter('user-1', {
        baselineId: 'baseline-1',
        baselineVersionId: 'baseline-version-1',
        jobId: 'job-1',
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(complianceService.validateAndAudit).toHaveBeenCalled();
  });

  it('rejects generation without a baseline version id', async () => {
    const service = new CoverLettersService(dataSource, complianceService as any);

    await expect(
      service.generateCoverLetter('user-1', {
        baselineId: 'baseline-1',
        jobId: 'job-1',
        baselineVersionId: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
