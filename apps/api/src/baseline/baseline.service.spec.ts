import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BaselineBlockPolicy } from './baseline-block-policy.entity';
import { Baseline } from './baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from './baseline-section.entity';
import { BaselineVersion } from './baseline-version.entity';
import { BaselineParserService } from './baseline-parser.service';
import { BaselineService } from './baseline.service';
import { BaselineTextExtractor } from './baseline-text-extractor.service';

describe('BaselineService - block policies', () => {
  let service: BaselineService;
  let baselineRepository: any;
  let baselineVersionRepository: any;
  let baselineSectionRepository: any;
  let baselineBlockPolicyRepository: any;

  const sections: BaselineSection[] = [
    {
      id: 's-1',
      baselineId: 'b-1',
      sectionType: BaselineSectionType.EXPERIENCE as any,
      title: null,
      content: 'Did important work.',
      includePolicy: BaselineIncludePolicy.OPTIONAL,
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BaselineSection,
    {
      id: 's-2',
      baselineId: 'b-1',
      sectionType: BaselineSectionType.SKILLS as any,
      title: null,
      content: 'Typescript, leadership',
      includePolicy: BaselineIncludePolicy.OPTIONAL,
      order: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BaselineSection,
  ];

  const baseline: Baseline = {
    id: 'b-1',
    userId: 'user-1',
    version: 1,
    originalFilename: 'resume.pdf',
    mimeType: 'application/pdf',
    storagePath: '/tmp/resume.pdf',
    hash: 'hash',
    sections,
    versions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Baseline;

  const baselineVersion: BaselineVersion = {
    id: 'v-1',
    baselineId: 'b-1',
    versionNumber: 1,
    fileHash: 'hash-1',
    storagePath: '/tmp/resume.pdf',
    baseline,
    createdAt: new Date(),
  } as BaselineVersion;

  const transactionManager = {
    create: jest.fn((_: any, payload: any) => payload),
    save: jest.fn(async (payload: any) => {
      if (Array.isArray(payload)) {
        return payload.map((item: any, index: number) => ({
          ...item,
          id: item.id ?? `generated-${index}`,
        }));
      }

      return {
        ...payload,
        id: payload.id ?? 'generated-id',
      };
    }),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    baselineRepository = {
      findOne: jest.fn(({ where }: any) =>
        where.userId === baseline.userId && where.id === baseline.id
          ? baseline
          : null,
      ),
      manager: { transaction: jest.fn(async (cb: any) => cb(transactionManager)) },
      save: jest.fn(),
    };

    baselineVersionRepository = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where?.id && where.id !== baselineVersion.id) return null;
        if (where?.baselineId && where.baselineId !== baseline.id) return null;
        return baselineVersion;
      }),
      find: jest.fn(),
      save: jest.fn(async (value: any) => value),
    };

    baselineSectionRepository = {
      find: jest.fn().mockResolvedValue(sections),
    };

    baselineBlockPolicyRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      providers: [
        BaselineService,
        { provide: getRepositoryToken(Baseline), useValue: baselineRepository },
        { provide: getRepositoryToken(BaselineSection), useValue: baselineSectionRepository },
        { provide: getRepositoryToken(BaselineVersion), useValue: baselineVersionRepository },
        { provide: getRepositoryToken(BaselineBlockPolicy), useValue: baselineBlockPolicyRepository },
        { provide: BaselineTextExtractor, useValue: { extractText: jest.fn() } },
        { provide: BaselineParserService, useValue: { parseBaseline: jest.fn() } },
      ],
    }).compile();

    service = module.get(BaselineService);
  });

  it('enforces ownership when listing blocks', async () => {
    await expect(
      service.listBlocksForBaselineVersion('b-1', 'v-1', 'other-user'),
    ).rejects.toThrow('Baseline not found');
  });

  it('rejects invalid include_tag values', async () => {
    await expect(
      service.updateBlockPolicies('user-1', 'b-1', {
        baseline_version_id: 'v-1',
        baseline_version_hash: 'hash-1',
        blocks: [{ id: 's-1', include_tag: 'sometimes' as any }],
      }),
    ).rejects.toThrow('Invalid include_tag value');
  });

  it('surfaces 409 conflicts when hashes are stale', async () => {
    await expect(
      service.updateBlockPolicies('user-1', 'b-1', {
        baseline_version_id: 'v-1',
        baseline_version_hash: 'stale',
        blocks: [
          { id: 's-1', include_tag: BaselineIncludePolicy.ALWAYS },
          { id: 's-2', include_tag: BaselineIncludePolicy.NEVER },
        ],
      }),
    ).rejects.toThrow(ConflictException);
  });
});
