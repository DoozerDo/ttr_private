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

describe('BaselineVersionService', () => {
  let service: BaselineVersionService;
  let baselineVersionRepository: any;
  let baselineRepository: any;
  let baselineSectionRepository: any;
  let baselineBlockPolicyRepository: any;
  let interviewRepository: any;

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
      ],
    }).compile();

    service = moduleRef.get(BaselineVersionService);
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
});
