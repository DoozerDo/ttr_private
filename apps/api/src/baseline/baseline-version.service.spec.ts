import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { BaselineBlockPolicy } from './baseline-block-policy.entity';
import { Baseline } from './baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from './baseline-section.entity';
import { BaselineVersion } from './baseline-version.entity';
import { BaselineVersionService } from './baseline-version.service';
import { Interview } from '../interviews/interview.entity';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceAction, ComplianceFlagCode, ComplianceFlagSeverity } from '../compliance/compliance.types';

describe('BaselineVersionService', () => {
  let service: BaselineVersionService;
  let baselineVersionRepository: any;
  let baselineRepository: any;
  let baselineSectionRepository: any;
  let baselineBlockPolicyRepository: any;
  let interviewRepository: any;
  let complianceService: ComplianceService;

  const baseline: Baseline = {
    id: 'baseline-1',
    userId: 'user-1',
    version: 1,
    originalFilename: 'resume.pdf',
    mimeType: 'application/pdf',
    storagePath: '/tmp/resume.pdf',
    hash: 'base-hash',
    sections: [
      {
        id: 'section-1',
        baselineId: 'baseline-1',
        sectionType: BaselineSectionType.EXPERIENCE,
        title: null,
        content: 'Experience content',
        includePolicy: BaselineIncludePolicy.OPTIONAL,
        order: 0,
      } as BaselineSection,
    ],
    versions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Baseline;

  const baselineVersion: BaselineVersion = {
    id: 'version-1',
    baselineId: 'baseline-1',
    versionNumber: 1,
    fileHash: 'existing-hash',
    storagePath: baseline.storagePath,
    baseline,
    verifiedAdditions: [],
    additionDiff: null,
    promotedFromInterviewId: null,
    createdAt: new Date(),
  } as BaselineVersion;

  beforeEach(async () => {
    baselineRepository = {
      findOne: jest.fn().mockResolvedValue({ ...baseline }),
      manager: {
        transaction: jest.fn(async (cb: any) =>
          cb({
            create: (_: any, payload: any) => payload,
            save: async (value: any) => value,
          }),
        ),
        save: jest.fn(async (value: any) => value),
      },
      save: jest.fn(async (value: any) => value),
    };

    baselineVersionRepository = {
      findOne: jest.fn().mockResolvedValue({ ...baselineVersion }),
      save: jest.fn(),
    };

    baselineSectionRepository = {
      find: jest.fn().mockResolvedValue(baseline.sections),
    };

    baselineBlockPolicyRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    interviewRepository = {
      findOne: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BaselineVersionService,
        { provide: getRepositoryToken(Baseline), useValue: baselineRepository },
        { provide: getRepositoryToken(BaselineSection), useValue: baselineSectionRepository },
        { provide: getRepositoryToken(BaselineVersion), useValue: baselineVersionRepository },
        { provide: getRepositoryToken(BaselineBlockPolicy), useValue: baselineBlockPolicyRepository },
        { provide: getRepositoryToken(Interview), useValue: interviewRepository },
        {
          provide: ComplianceService,
          useValue: {
            validateAndAudit: jest.fn().mockResolvedValue({
              blocked: false,
              complianceFlags: [],
              audit: {
                id: 'audit-1',
                baselineVersionId: baselineVersion.id,
                outputHash: 'hash',
                action: ComplianceAction.BASELINE_PROMOTION,
                actorId: 'user-1',
                baselineVersionHash: baseline.hash,
                jobId: null,
                createdAt: new Date().toISOString(),
              },
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(BaselineVersionService);
    complianceService = moduleRef.get(ComplianceService);
  });

  it('creates a new version without mutating prior versions', async () => {
    const result = await service.approveVerifiedAdditions('user-1', {
      baselineId: 'baseline-1',
      additions: ['added context'],
    });

    expect(result.version_number).toBe(2);
    expect(result.diff).toEqual({ added: ['added context'], interviewId: null });
    expect(baselineVersion.fileHash).toBe('existing-hash');
    expect(baselineVersion.verifiedAdditions).toEqual([]);
  });

  it('audits compliance before writing baseline promotions', async () => {
    await service.approveVerifiedAdditions('user-1', {
      baselineId: 'baseline-1',
      additions: ['compliance check'],
    });

    expect(complianceService.validateAndAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ComplianceAction.BASELINE_PROMOTION,
        actorId: 'user-1',
        generatedSections: expect.arrayContaining([
          expect.objectContaining({ content: 'compliance check' }),
        ]),
      }),
    );
  });

  it('generates deterministic hashes regardless of addition ordering', async () => {
    const additions = ['b addition', 'a addition'];
    const policies = baseline.sections.map((section, index) => ({
      id: section.id,
      includePolicy: section.includePolicy,
      order: section.order ?? index,
    }));
    const expectedHash = createHash('sha256')
      .update(
        JSON.stringify({
          baselineHash: baseline.hash,
          policies,
          additions: [...additions].sort((a, b) => a.localeCompare(b)),
        }),
      )
      .digest('hex');

    const result = await service.approveVerifiedAdditions('user-1', {
      baselineId: 'baseline-1',
      additions,
    });

    expect(result.hash).toBe(expectedHash);
  });

  it('rejects additions that introduce technologies outside the baseline vocabulary', async () => {
    jest.spyOn(complianceService, 'validateAndAudit').mockResolvedValueOnce({
      blocked: true,
      complianceFlags: [
        {
          code: ComplianceFlagCode.FICTIONAL_TECHNOLOGY,
          severity: ComplianceFlagSeverity.BLOCK,
          message: 'Technology "ImaginaryDB" not found in baseline.',
        },
      ],
      audit: {
        id: 'audit-2',
        baselineVersionId: baselineVersion.id,
        outputHash: 'hash',
        action: ComplianceAction.BASELINE_PROMOTION,
        actorId: 'user-1',
        baselineVersionHash: baseline.hash,
        jobId: null,
        createdAt: new Date().toISOString(),
      },
    });

    await expect(
      service.approveVerifiedAdditions('user-1', {
        baselineId: 'baseline-1',
        additions: ['Built ImaginaryDB cluster'],
      }),
    ).rejects.toThrow('Technology "ImaginaryDB" not found in baseline.');
  });
});
