import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from './baseline-section.entity';
import { Baseline, BaselineStatus } from './baseline.entity';
import { BaselineBlockPolicy } from './baseline-block-policy.entity';
import { BaselineParsed } from './baseline-parsed.entity';
import { BaselineVersion } from './baseline-version.entity';
import { BaselineIngestionService } from './baseline-ingestion.service';
import { BaselineService } from './baseline.service';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { EmbeddingService } from '../ai/embedding.service';

describe('BaselineService - block policies', () => {
  let service: BaselineService;
  let baselineRepository: any;
  let baselineVersionRepository: any;
  let baselineSectionRepository: any;
  let baselineBlockPolicyRepository: any;
  let fitAssessmentRepository: any;

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

const canonicalBaseline = {
  identity: {
    full_name: 'Test User',
    current_title: null,
    current_company: null,
    location: null,
  },
  experience: [],
  people_leadership: {
    direct_reports: null,
    managers_led: null,
    global_teams: null,
  },
  operational_ownership: {
    functions_owned: [],
    process_design: null,
    process_scaling: null,
  },
  tooling_and_platforms: {
    tools: [],
    ownership_level: 'unknown',
  },
  cross_functional_partnership: {
    product: null,
    engineering: null,
    sales_cs: null,
    executive: null,
  },
  customer_advocacy: {
    executive_escalations: null,
    voice_of_customer: null,
    post_incident_rca: null,
  },
  scale_and_scope: {
    customer_segment: 'unknown',
    geo_scope: 'unknown',
    org_stage: 'unknown',
  },
  metrics_and_outcomes: {
    metrics_present: false,
    metrics: [],
  },
  skills_and_tools: {
    tools: [],
    methodologies: [],
    domains: [],
  },
  system_generated_read_only: {
    missing_fields: [],
    ambiguity_flags: [],
    low_confidence_extractions: [],
  },
};

const ingestionResult = {
  rawText: 'raw',
  parsedSections: [],
  canonical: canonicalBaseline,
  sourceFormat: 'docx' as const,
};

  const transactionManager = {
    create: jest.fn((_: any, payload: any) => payload),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(async () => ({ affected: 1 })),
    save: jest.fn(async (...args: any[]) => {
      const payload = args.length > 1 ? args[1] : args[0];
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
    fitAssessmentRepository = {
      create: jest.fn((payload: any) => payload),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
      findOne: jest.fn().mockResolvedValue({
        id: 'assessment-1',
        userId: 'user-1',
        baselineId: 'b-1',
        overallScore: 80,
        scoringV2: {
          debug: {
            bundle: {
              inputs: {
                normalizedJob: {
                  requirements: [
                    { snippet: 'reduce incident resolution time' },
                    { snippet: 'improve team coordination' },
                  ],
                },
              },
            },
          },
        },
      }),
    };

    baselineRepository = {
      findOne: jest.fn(({ where }: any) =>
        where.userId === baseline.userId && where.id === baseline.id
          ? baseline
          : null,
      ),
      manager: {
        transaction: jest.fn(async (cb: any) => cb(transactionManager)),
      },
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
        {
          provide: getRepositoryToken(BaselineSection),
          useValue: baselineSectionRepository,
        },
        {
          provide: getRepositoryToken(BaselineVersion),
          useValue: baselineVersionRepository,
        },
        {
          provide: getRepositoryToken(BaselineBlockPolicy),
          useValue: baselineBlockPolicyRepository,
        },
        {
          provide: getRepositoryToken(BaselineParsed),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: getRepositoryToken(FitAssessment),
          useValue: fitAssessmentRepository,
        },
        {
          provide: BaselineIngestionService,
          useValue: {
            ingest: jest.fn().mockResolvedValue(ingestionResult),
            ingestFromText: jest.fn().mockResolvedValue(ingestionResult),
          },
        },
        {
          provide: EmbeddingService,
          useValue: {
            embedText: jest.fn().mockResolvedValue([]),
            embedTexts: jest.fn().mockResolvedValue([]),
          },
        },
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

  it('returns updated policy metadata and new version id', async () => {
    const result = await service.updateBlockPolicies('user-1', 'b-1', {
      baseline_version_id: 'v-1',
      baseline_version_hash: 'hash-1',
      blocks: [
        { id: 's-1', include_tag: BaselineIncludePolicy.ALWAYS },
        { id: 's-2', include_tag: BaselineIncludePolicy.NEVER },
      ],
    });

    expect(result.new_version_id).toBeDefined();
    expect(result.updated_blocks).toHaveLength(2);
    expect(result.updated_blocks.find((block) => block.id === 's-2')?.include_tag).toBe(
      BaselineIncludePolicy.NEVER,
    );
    expect(result.hash).toBeDefined();
  });

  it('returns hasCompletedAssessment false when no fit assessments exist', async () => {
    baselineRepository.find = jest.fn().mockResolvedValue([baseline]);
    const qb = {
      distinctOn: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    fitAssessmentRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listBaselinesForUser('user-1');

    expect(result[0].latestAssessmentSummary.hasCompletedAssessment).toBe(false);
    expect(result[0].latestAssessmentSummary.latestFitScore).toBeNull();
  });

  it('returns latest fit assessment summary keyed by exact baseline id', async () => {
    baselineRepository.find = jest.fn().mockResolvedValue([baseline]);
    const qb = {
      distinctOn: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          baselineId: 'b-1',
          id: 'assessment-2',
          createdAt: '2026-03-25T10:00:00.000Z',
          overallScore: 84,
        },
      ]),
    };
    fitAssessmentRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listBaselinesForUser('user-1');

    expect(result[0].latestAssessmentSummary.hasCompletedAssessment).toBe(true);
    expect(result[0].latestAssessmentSummary.latestAssessmentId).toBe('assessment-2');
    expect(result[0].latestAssessmentSummary.latestFitScore).toBe(84);
    expect(result[0].latestAssessmentSummary.latestAssessmentCreatedAt).toBeInstanceOf(Date);
  });

  it('returns baselines with default assessment summary when assessment lookup fails', async () => {
    baselineRepository.find = jest.fn().mockResolvedValue([baseline]);
    const qb = {
      distinctOn: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockRejectedValue(new Error('relation "fit_assessments" does not exist')),
    };
    fitAssessmentRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listBaselinesForUser('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b-1');
    expect(result[0].latestAssessmentSummary).toEqual({
      latestAssessmentId: null,
      latestAssessmentCreatedAt: null,
      latestFitScore: null,
      hasCompletedAssessment: false,
    });
  });

  it('returns analyzed assessment summary on baseline detail when completed assessment exists', async () => {
    const qb = {
      distinctOn: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          baselineId: 'b-1',
          id: 'assessment-9',
          createdAt: '2026-03-26T10:00:00.000Z',
          overallScore: 91,
        },
      ]),
    };
    fitAssessmentRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getBaselineByIdForUser('b-1', 'user-1');

    expect(result.latestAssessmentSummary.hasCompletedAssessment).toBe(true);
    expect(result.latestAssessmentSummary.latestAssessmentId).toBe('assessment-9');
    expect(result.latestAssessmentSummary.latestFitScore).toBe(91);
  });

  it('uses distinctOn when loading the latest assessment summary', async () => {
    baselineRepository.find = jest.fn().mockResolvedValue([baseline]);
    const qb = {
      distinctOn: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    fitAssessmentRepository.createQueryBuilder.mockReturnValue(qb);

    await service.listBaselinesForUser('user-1');

    expect(qb.distinctOn).toHaveBeenCalledWith(['assessment.baselineId']);
    expect(qb.select).toHaveBeenCalledWith('assessment."baselineId"', 'baselineId');
  });

  it('returns default not analyzed summary on baseline detail when no completed assessment exists', async () => {
    const qb = {
      distinctOn: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    fitAssessmentRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getBaselineByIdForUser('b-1', 'user-1');

    expect(result.latestAssessmentSummary).toEqual({
      latestAssessmentId: null,
      latestAssessmentCreatedAt: null,
      latestFitScore: null,
      hasCompletedAssessment: false,
    });
  });
});

describe('BaselineService - library capacity', () => {
  let service: BaselineService;
  let baselineRepository: any;
  let transactionManager: any;

  const parseResult = {
    sections: [
      {
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: 'Led support operations.',
        includePolicy: BaselineIncludePolicy.OPTIONAL,
        order: 0,
      },
    ],
    ingestion: {
      rawText: 'raw',
      parsedSections: [],
      canonical: null,
      sourceFormat: 'docx' as const,
    },
  };

  beforeEach(async () => {
    transactionManager = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((_: any, payload: any) => payload),
      update: jest.fn(async () => ({ affected: 1 })),
      save: jest.fn(async (payload: any) => {
        if (Array.isArray(payload)) return payload;
        return { ...payload, id: payload.id ?? 'generated-id', version: payload.version ?? 1 };
      }),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    };

    baselineRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      manager: {
        transaction: jest.fn(async (cb: any) => cb(transactionManager)),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        BaselineService,
        { provide: getRepositoryToken(Baseline), useValue: baselineRepository },
        {
          provide: getRepositoryToken(BaselineSection),
          useValue: { find: jest.fn(), save: jest.fn(), update: jest.fn() },
        },
        {
          provide: getRepositoryToken(BaselineVersion),
          useValue: { findOne: jest.fn(), find: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(BaselineBlockPolicy),
          useValue: { find: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(BaselineParsed),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(FitAssessment),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: BaselineIngestionService,
          useValue: {},
        },
        {
          provide: EmbeddingService,
          useValue: {
            embed: jest.fn().mockResolvedValue([]),
            embedText: jest.fn().mockResolvedValue([]),
            embedTexts: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get(BaselineService);
    jest.spyOn(service as any, 'computeFileHash').mockResolvedValue('hash-1');
    jest.spyOn(service as any, 'attachEmbeddingsToSections').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'persistParsedBaseline').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'buildVersionHash').mockReturnValue('version-hash');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows the first upload when the library is empty', async () => {
    const result = await service.createBaseline(
      'user-1',
      { originalname: 'resume.pdf', mimetype: 'application/pdf', path: '/tmp/resume.pdf' },
      parseResult as any,
    );

    expect(result.baselineId).toBeDefined();
    expect(transactionManager.count).toHaveBeenCalledWith(Baseline, {
      where: { userId: 'user-1', status: BaselineStatus.ACTIVE },
    });
  });

  it('blocks a fourth upload with a structured cap error', async () => {
    transactionManager.count.mockResolvedValue(3);

    await expect(
      service.createBaseline(
        'user-1',
        { originalname: 'resume.pdf', mimetype: 'application/pdf', path: '/tmp/resume.pdf' },
        parseResult as any,
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'BASELINE_LIBRARY_CAP_REACHED',
          details: {
            activeCount: 3,
            maxCount: 3,
          },
        },
      },
    });
  });

  it('allows uploads when archived baselines exist but active count stays under the cap', async () => {
    transactionManager.count.mockResolvedValue(2);

    const result = await service.createBaseline(
      'user-1',
      { originalname: 'resume.pdf', mimetype: 'application/pdf', path: '/tmp/resume.pdf' },
      parseResult as any,
    );

    expect(result.baselineId).toBeDefined();
    expect(transactionManager.count).toHaveBeenCalledWith(Baseline, {
      where: { userId: 'user-1', status: BaselineStatus.ACTIVE },
    });
  });

  it('returns a structured duplicate conflict when the same file hash exists on an active baseline', async () => {
    baselineRepository.findOne.mockImplementation(async ({ where }: any) => {
      if (where?.hash && where?.status === BaselineStatus.ACTIVE) {
        return {
          id: 'baseline-dup',
          userId: 'user-1',
          hash: 'hash-1',
          status: BaselineStatus.ACTIVE,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
        } as Baseline;
      }
      return null;
    });

    await expect(
      service.createBaseline(
        'user-1',
        { originalname: 'resume.pdf', mimetype: 'application/pdf', path: '/tmp/resume.pdf' },
        parseResult as any,
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'BASELINE_DUPLICATE',
        },
      },
    });
  });

  it('does not treat archived baseline hashes as duplicates for uploads', async () => {
    baselineRepository.findOne.mockImplementation(async ({ where }: any) => {
      if (where?.hash) {
        // Even if an archived baseline exists with this hash, the duplicate lookup
        // only considers ACTIVE baselines.
        return null;
      }
      return null;
    });

    const result = await service.createBaseline(
      'user-1',
      { originalname: 'resume.pdf', mimetype: 'application/pdf', path: '/tmp/resume.pdf' },
      parseResult as any,
    );

    expect(result.baselineId).toBeDefined();
    expect(baselineRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hash: 'hash-1',
          status: BaselineStatus.ACTIVE,
        }),
      }),
    );
  });

  it('increments the active baseline version and keeps only one active baseline', async () => {
    const priorBaseline = {
      id: 'prior-baseline',
      userId: 'user-1',
      version: 4,
      versionNumber: 4,
      status: BaselineStatus.ACTIVE,
      isActive: true,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    } as Baseline;

    baselineRepository.findOne.mockImplementation(async ({ where, order }: any) => {
      if (where?.hash) {
        return null;
      }
      if (where?.userId === 'user-1' && order?.versionNumber) {
        return priorBaseline;
      }
      return null;
    });

    const result = await service.createBaseline(
      'user-1',
      { originalname: 'resume.pdf', mimetype: 'application/pdf', path: '/tmp/resume.pdf' },
      parseResult as any,
    );

    expect(result.baseline.versionNumber).toBe(5);
    expect(result.baseline.isActive).toBe(true);
    expect(transactionManager.update).toHaveBeenCalledWith(
      Baseline,
      { userId: 'user-1' },
      { isActive: false },
    );
    expect(transactionManager.update).toHaveBeenCalledWith(
      Baseline,
      { id: result.baseline.id, userId: 'user-1' },
      { isActive: true },
    );
  });

  it('creates a second baseline as non-active when an active baseline already exists', async () => {
    const priorBaseline = {
      id: 'prior-baseline',
      userId: 'user-1',
      version: 4,
      versionNumber: 4,
      status: BaselineStatus.ACTIVE,
      isActive: true,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    } as Baseline;

    baselineRepository.findOne.mockImplementation(async ({ where, order }: any) => {
      if (where?.hash) {
        return null;
      }
      if (where?.userId === 'user-1' && order?.versionNumber) {
        return priorBaseline;
      }
      return null;
    });

    transactionManager.count.mockImplementation(async (_entity: any, options: any) => {
      if (options?.where?.isActive === true) {
        return 1;
      }
      return 0;
    });

    const result = await service.createBaseline(
      'user-1',
      { originalname: 'resume-2.pdf', mimetype: 'application/pdf', path: '/tmp/resume-2.pdf' },
      parseResult as any,
    );

    expect(result.baseline.versionNumber).toBe(5);
    expect(result.baseline.isActive).toBe(false);
    expect(transactionManager.update).not.toHaveBeenCalledWith(
      Baseline,
      { userId: 'user-1' },
      { isActive: false },
    );
    expect(transactionManager.update).not.toHaveBeenCalledWith(
      Baseline,
      { id: result.baseline.id, userId: 'user-1' },
      { isActive: true },
    );
  });
});

describe('BaselineService - reparse ingestion source', () => {
  let service: BaselineService;
  let baselineRepository: any;
  let ingestionService: any;
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
  const canonicalBaseline = {
    identity: {
      full_name: 'Test User',
      current_title: null,
      current_company: null,
      location: null,
    },
    experience: [],
    people_leadership: {
      direct_reports: null,
      managers_led: null,
      global_teams: null,
    },
    operational_ownership: {
      functions_owned: [],
      process_design: null,
      process_scaling: null,
    },
    tooling_and_platforms: {
      tools: [],
      ownership_level: 'unknown',
    },
    cross_functional_partnership: {
      product: null,
      engineering: null,
      sales_cs: null,
      executive: null,
    },
    customer_advocacy: {
      executive_escalations: null,
      voice_of_customer: null,
      post_incident_rca: null,
    },
    scale_and_scope: {
      customer_segment: 'unknown',
      geo_scope: 'unknown',
      org_stage: 'unknown',
    },
    metrics_and_outcomes: {
      metrics_present: false,
      metrics: [],
    },
    skills_and_tools: {
      tools: [],
      methodologies: [],
      domains: [],
    },
    system_generated_read_only: {
      missing_fields: [],
      ambiguity_flags: [],
      low_confidence_extractions: [],
    },
  };

  beforeEach(async () => {
    baselineRepository = {
      findOne: jest.fn(),
      manager: {
        transaction: jest.fn(async (cb: any) =>
          cb({
            create: jest.fn((_: any, payload: any) => payload),
            save: jest.fn(async (value: any) => value),
            delete: jest.fn(),
          }),
        ),
      },
    };

    ingestionService = {
      ingest: jest.fn(),
      ingestFromText: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        BaselineService,
        { provide: getRepositoryToken(Baseline), useValue: baselineRepository },
        { provide: getRepositoryToken(BaselineSection), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(BaselineVersion), useValue: { findOne: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(BaselineBlockPolicy), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(BaselineParsed), useValue: { findOne: jest.fn() } },
        {
          provide: getRepositoryToken(FitAssessment),
          useValue: {
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              addOrderBy: jest.fn().mockReturnThis(),
              getRawMany: jest.fn().mockResolvedValue([]),
            })),
          },
        },
        { provide: BaselineIngestionService, useValue: ingestionService },
        {
          provide: EmbeddingService,
          useValue: {
            embedText: jest.fn().mockResolvedValue([]),
            embedTexts: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get(BaselineService);
  });

  it('preserves newlines in sanitizeSectionContent', () => {
    const sanitized = (service as any).sanitizeSectionContent('line 1\r\nline 2\n\tline 3\u0000');
    expect(sanitized).toContain('line 1\nline 2\n\tline 3');
    expect(sanitized).not.toContain('\u0000');
  });

  it('re-ingests from storagePath file before falling back to raw section text', async () => {
    const canonical = { ...canonicalBaseline };
    ingestionService.ingest.mockResolvedValue({
      rawText: 'from file',
      parsedSections: [],
      canonical,
      sourceFormat: 'docx',
    });

    const baselineRecord = {
      ...baseline,
      sections: [
        {
          ...sections[0],
          sectionType: BaselineSectionType.RAW,
          content: 'raw fallback text',
        },
      ],
    } as Baseline;

    const result = await (service as any).reingestFromSourceFileOrFallback(
      baselineRecord,
      'raw fallback text',
      'pdf',
    );

    expect(ingestionService.ingest).toHaveBeenCalledTimes(1);
    expect(ingestionService.ingestFromText).not.toHaveBeenCalled();
    expect(result.rawText).toBe('from file');
  });

  it('falls back to ingestFromText when source file ingest throws', async () => {
    const canonical = { ...canonicalBaseline };
    ingestionService.ingest.mockRejectedValue(new Error('missing file'));
    ingestionService.ingestFromText.mockResolvedValue({
      rawText: 'fallback',
      parsedSections: [],
      canonical,
      sourceFormat: 'pdf',
    });

    const baselineRecord = {
      ...baseline,
      storagePath: '/missing/path',
    } as Baseline;

    const result = await (service as any).reingestFromSourceFileOrFallback(
      baselineRecord,
      'raw fallback text',
      'pdf',
    );

    expect(ingestionService.ingest).toHaveBeenCalledTimes(1);
    expect(ingestionService.ingestFromText).toHaveBeenCalledWith('raw fallback text', 'pdf');
    expect(result.rawText).toBe('fallback');
  });
});

describe('BaselineService - score history persistence', () => {
  let service: BaselineService;
  let baselineRepository: any;
  let fitAssessmentRepository: any;
  let transactionManager: any;

  beforeEach(async () => {
    transactionManager = {
      create: jest.fn((_: any, payload: any) => payload),
      save: jest.fn(async (...args: any[]) => {
        const payload = args.length > 1 ? args[1] : args[0];
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
      update: jest.fn(async () => ({ affected: 1 })),
      delete: jest.fn(),
    };

    baselineRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value: any) => value),
      update: jest.fn(async () => ({ affected: 1 })),
      manager: {
        transaction: jest.fn(async (cb: any) => cb(transactionManager)),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        BaselineService,
        { provide: getRepositoryToken(Baseline), useValue: baselineRepository },
        { provide: getRepositoryToken(BaselineSection), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(BaselineVersion), useValue: { findOne: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(BaselineBlockPolicy), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(BaselineParsed), useValue: { findOne: jest.fn() } },
        {
          provide: getRepositoryToken(FitAssessment),
          useValue: (fitAssessmentRepository = {
            create: jest.fn((payload: any) => payload),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              addOrderBy: jest.fn().mockReturnThis(),
              getRawMany: jest.fn().mockResolvedValue([]),
            })),
          }),
        },
        {
          provide: BaselineIngestionService,
          useValue: {
            ingest: jest.fn(),
            ingestFromText: jest.fn(),
          },
        },
        {
          provide: EmbeddingService,
          useValue: {
            embedText: jest.fn().mockResolvedValue([]),
            embedTexts: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get(BaselineService);
  });

  it('sets original and latest score on first successful analysis', async () => {
    baselineRepository.findOne.mockResolvedValue({
      id: 'b-1',
      userId: 'user-1',
      originalBaselineScore: null,
      latestBaselineScore: null,
      firstAnalyzedAt: null,
      lastAnalyzedAt: null,
    });

    const result = await service.recordBaselineAnalysisScore('user-1', 'b-1', 72);

    expect(result.originalBaselineScore).toBe(72);
    expect(result.latestBaselineScore).toBe(72);
    expect(result.firstAnalyzedAt).toBeInstanceOf(Date);
    expect(result.lastAnalyzedAt).toBeInstanceOf(Date);
  });

  it('preserves original score and updates latest on subsequent analyses', async () => {
    const firstAnalyzedAt = new Date('2026-01-01T00:00:00.000Z');
    baselineRepository.findOne.mockResolvedValue({
      id: 'b-1',
      userId: 'user-1',
      originalBaselineScore: 72,
      latestBaselineScore: 72,
      firstAnalyzedAt,
      lastAnalyzedAt: firstAnalyzedAt,
    });

    const result = await service.recordBaselineAnalysisScore('user-1', 'b-1', 78);

    expect(result.originalBaselineScore).toBe(72);
    expect(result.latestBaselineScore).toBe(78);
    expect(result.firstAnalyzedAt).toBe(firstAnalyzedAt);
    expect(result.lastAnalyzedAt).toBeInstanceOf(Date);
    expect(result.lastAnalyzedAt.getTime()).toBeGreaterThanOrEqual(firstAnalyzedAt.getTime());
  });

  it('analyzes baseline readiness without job id and returns analyzed summary', async () => {
    const baselineRecord = {
      id: 'b-1',
      userId: 'user-1',
      originalBaselineScore: null,
      latestBaselineScore: null,
      firstAnalyzedAt: null,
      lastAnalyzedAt: null,
      sections: [
        {
          id: 's-raw',
          baselineId: 'b-1',
          sectionType: BaselineSectionType.RAW,
          title: 'Raw',
          content: 'raw text',
          includePolicy: BaselineIncludePolicy.NEVER,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 's-exp',
          baselineId: 'b-1',
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Led customer operations and improved SLA outcomes by 18%.',
          includePolicy: BaselineIncludePolicy.OPTIONAL,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    } as Baseline;

    let persistedAssessment: any = null;
    fitAssessmentRepository.create.mockImplementation((payload: any) => payload);
    fitAssessmentRepository.createQueryBuilder.mockImplementation(() => ({
      distinctOn: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(
        persistedAssessment
          ? [
              {
                baselineId: 'b-1',
                id: persistedAssessment.id,
                createdAt: persistedAssessment.createdAt,
                overallScore: persistedAssessment.overallScore,
              },
            ]
          : [],
      ),
    }));
    transactionManager.save.mockImplementation(async (...args: any[]) => {
      const payload = args.length > 1 ? args[1] : args[0];
      persistedAssessment = {
        ...payload,
        id: payload.id ?? 'assessment-readiness-1',
        createdAt: payload.createdAt ?? new Date('2026-03-25T10:00:00.000Z'),
      };
      return persistedAssessment;
    });
    baselineRepository.findOne.mockImplementation(async () => baselineRecord);
    baselineRepository.save.mockImplementation(async (value: any) => {
      Object.assign(baselineRecord, value);
      return value;
    });

    const result = await service.analyzeBaselineReadiness('user-1', 'b-1');

    expect(transactionManager.save).toHaveBeenCalled();
    expect(persistedAssessment?.id).toBeDefined();
    expect(result.latestAssessmentSummary.hasCompletedAssessment).toBe(true);
    expect(result.latestAssessmentSummary.latestAssessmentId).toBe('assessment-readiness-1');
    expect(result.latestAssessmentSummary.latestFitScore).toBeGreaterThanOrEqual(45);
    expect(result.latestAssessmentSummary.latestAssessmentCreatedAt).toBeInstanceOf(Date);
  });

  it('rejects attempts to archive the current active baseline', async () => {
    const archiveManager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'b-3',
        userId: 'user-1',
        status: BaselineStatus.ACTIVE,
        isActive: true,
      }),
      find: jest.fn(),
      update: jest.fn(),
    };
    baselineRepository.manager.transaction.mockImplementation(async (cb: any) => cb(archiveManager));

    await expect(service.archiveBaseline('user-1', 'b-3')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(archiveManager.update).not.toHaveBeenCalled();
  });

  it('archives a non-current baseline and does not change the active baseline pointer', async () => {
    const archiveManager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'b-1',
        userId: 'user-1',
        status: BaselineStatus.ACTIVE,
        isActive: false,
      }),
      find: jest.fn().mockResolvedValue([
        {
          id: 'b-2',
          userId: 'user-1',
          status: BaselineStatus.ACTIVE,
          isActive: true,
          createdAt: new Date('2026-03-02T00:00:00.000Z'),
        },
        {
          id: 'b-1',
          userId: 'user-1',
          status: BaselineStatus.ACTIVE,
          isActive: false,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      ]),
      update: jest.fn(async () => ({ affected: 1 })),
    };
    baselineRepository.manager.transaction.mockImplementation(async (cb: any) => cb(archiveManager));

    archiveManager.findOne.mockImplementationOnce(async () => ({
      id: 'b-1',
      userId: 'user-1',
      status: BaselineStatus.ACTIVE,
      isActive: false,
    }));
    archiveManager.findOne.mockImplementationOnce(async () => ({
      id: 'b-1',
      userId: 'user-1',
      status: BaselineStatus.ARCHIVED,
      isActive: false,
      archivedAt: new Date('2026-03-10T00:00:00.000Z'),
    }));

    const result = await service.archiveBaseline('user-1', 'b-1');

    expect(archiveManager.update).toHaveBeenCalled();
    expect(result.status).toBe(BaselineStatus.ARCHIVED);
    expect(result.isActive).toBe(false);
  });

  it('throws a not found error when archiving a baseline the user cannot access', async () => {
    const archiveManager = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn(),
      save: jest.fn(),
    };
    baselineRepository.manager.transaction.mockImplementation(async (cb: any) => cb(archiveManager));

    await expect(service.archiveBaseline('user-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('BaselineService - strengthening additions', () => {
  let service: BaselineService;
  let baselineRepository: any;
  let baselineSectionRepository: any;
  let fitAssessmentRepository: any;

  beforeEach(async () => {
    baselineRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value: any) => value),
      update: jest.fn(async () => ({ affected: 1 })),
      manager: {
        transaction: jest.fn(async (cb: any) =>
          cb({
            create: jest.fn((_: any, payload: any) => payload),
            save: jest.fn(async (value: any) => value),
            delete: jest.fn(),
          }),
        ),
      },
    };

    baselineSectionRepository = {
      find: jest.fn(),
      save: jest.fn(async (value: any) => value),
      update: jest.fn(async () => ({ affected: 1 })),
      create: jest.fn((payload: any) => payload),
    };

    fitAssessmentRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'assessment-1',
        userId: 'user-1',
        baselineId: 'b-1',
        overallScore: 80,
        scoringV2: {
          debug: {
            bundle: {
              inputs: {
                normalizedJob: {
                  requirements: [
                    { snippet: 'reduce incident resolution time' },
                    { snippet: 'improve team coordination' },
                  ],
                },
              },
            },
          },
        },
      }),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
    };

    const module = await Test.createTestingModule({
      providers: [
        BaselineService,
        { provide: getRepositoryToken(Baseline), useValue: baselineRepository },
        { provide: getRepositoryToken(BaselineSection), useValue: baselineSectionRepository },
        { provide: getRepositoryToken(BaselineVersion), useValue: { findOne: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(BaselineBlockPolicy), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(BaselineParsed), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(FitAssessment), useValue: fitAssessmentRepository },
        {
          provide: BaselineIngestionService,
          useValue: {
            ingest: jest.fn(),
            ingestFromText: jest.fn(),
          },
        },
        {
          provide: EmbeddingService,
          useValue: {
            embed: jest.fn().mockResolvedValue([]),
            embedText: jest.fn().mockResolvedValue([]),
            embedTexts: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get(BaselineService);
  });

  it('appends approved detail when existing refinement section content is null', async () => {
    baselineRepository.findOne.mockResolvedValue({
      id: 'b-1',
      userId: 'user-1',
      sections: [
        {
          id: 'section-1',
          baselineId: 'b-1',
          sectionType: BaselineSectionType.OTHER,
          title: 'Approved signal refinements',
          content: null,
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    jest.spyOn(service, 'getBaselineByIdForUser').mockResolvedValue({
      id: 'b-1',
      latestBaselineScore: 80,
      sections: [
        {
          id: 'section-1',
          baselineId: 'b-1',
          sectionType: BaselineSectionType.OTHER,
          title: 'Approved signal refinements',
          content: null,
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    } as Baseline);

    await expect(
      service.appendStrengtheningAddition('user-1', 'b-1', 'Added leadership evidence'),
    ).resolves.toMatchObject({
      impactType: 'low_quality',
      scoreDelta: 0,
    });

    expect(baselineSectionRepository.update).toHaveBeenCalledWith(
      { id: 'section-1', baselineId: 'b-1' },
      expect.objectContaining({
        content: 'Added leadership evidence',
        updatedAt: expect.any(Date),
      }),
    );
  });

  it('returns duplicate impact for redundant evidence and does not change score', async () => {
    baselineRepository.findOne.mockResolvedValue({
      id: 'b-1',
      userId: 'user-1',
      latestBaselineScore: 80,
      sections: [
        {
          id: 'section-1',
          baselineId: 'b-1',
          sectionType: BaselineSectionType.OTHER,
          title: 'Approved signal refinements',
          content: 'I reduced incident resolution time by 18% across the support team.',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    jest.spyOn(service, 'getBaselineByIdForUser').mockResolvedValue({
      id: 'b-1',
      latestBaselineScore: 80,
      sections: [
        {
          id: 'section-1',
          baselineId: 'b-1',
          sectionType: BaselineSectionType.OTHER,
          title: 'Approved signal refinements',
          content: 'I reduced incident resolution time by 18% across the support team.',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    } as Baseline);

    await expect(
      service.appendStrengtheningAddition(
        'user-1',
        'b-1',
        'I reduced incident resolution time by 18% across the support team.',
      ),
    ).resolves.toMatchObject({
      impactType: 'duplicate',
      changeClassification: 'no_change_duplicate',
      scoreDelta: 0,
    });

    expect(baselineSectionRepository.update).not.toHaveBeenCalled();
    expect(baselineRepository.update).not.toHaveBeenCalled();
  });

  it('returns a new match impact and increases score for unmet requirement evidence', async () => {
    baselineRepository.findOne.mockResolvedValue({
      id: 'b-1',
      userId: 'user-1',
      latestBaselineScore: 80,
      sections: [
        {
          id: 'section-1',
          baselineId: 'b-1',
          sectionType: BaselineSectionType.OTHER,
          title: 'Approved signal refinements',
          content: 'Led support operations across the customer success team.',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    jest.spyOn(service, 'getBaselineByIdForUser').mockResolvedValue({
      id: 'b-1',
      latestBaselineScore: 80,
      sections: [
        {
          id: 'section-1',
          baselineId: 'b-1',
          sectionType: BaselineSectionType.OTHER,
          title: 'Approved signal refinements',
          content: 'Led support operations across the customer success team.',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    } as Baseline);

    await expect(
      service.appendStrengtheningAddition(
        'user-1',
        'b-1',
        'Reduced incident resolution time by 18% by redesigning the escalation workflow.',
      ),
    ).resolves.toMatchObject({
      impactType: 'new_match',
      scoreDelta: 3,
      matchedRequirement: 'reduce incident resolution time',
    });
  });

  it('returns low quality impact for vague evidence and keeps score flat', async () => {
    baselineRepository.findOne.mockResolvedValue({
      id: 'b-1',
      userId: 'user-1',
      latestBaselineScore: 80,
      sections: [],
    });
    jest.spyOn(service, 'getBaselineByIdForUser').mockResolvedValue({
      id: 'b-1',
      latestBaselineScore: 80,
      sections: [],
    } as Baseline);

    await expect(
      service.appendStrengtheningAddition('user-1', 'b-1', 'Worked on things and helped out.'),
    ).resolves.toMatchObject({
      impactType: 'low_quality',
      scoreDelta: 0,
    });
  });
});
