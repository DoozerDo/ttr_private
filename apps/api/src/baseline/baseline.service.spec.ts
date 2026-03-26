import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from './baseline-section.entity';
import { Baseline } from './baseline.entity';
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
    fitAssessmentRepository = {
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

  it('returns default not analyzed summary on baseline detail when no completed assessment exists', async () => {
    const qb = {
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

    baselineRepository.findOne.mockImplementation(async () => baselineRecord);
    baselineRepository.save.mockImplementation(async (value: any) => {
      Object.assign(baselineRecord, value);
      return value;
    });

    const result = await service.analyzeBaselineReadiness('user-1', 'b-1');

    expect(result.latestAssessmentSummary.hasCompletedAssessment).toBe(true);
    expect(result.latestAssessmentSummary.latestFitScore).toBeGreaterThanOrEqual(45);
    expect(result.latestAssessmentSummary.latestAssessmentCreatedAt).toBeInstanceOf(Date);
  });
});

describe('BaselineService - strengthening additions', () => {
  let service: BaselineService;
  let baselineRepository: any;
  let baselineSectionRepository: any;

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

    const module = await Test.createTestingModule({
      providers: [
        BaselineService,
        { provide: getRepositoryToken(Baseline), useValue: baselineRepository },
        { provide: getRepositoryToken(BaselineSection), useValue: baselineSectionRepository },
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

    jest.spyOn(service, 'getBaselineByIdForUser').mockResolvedValue({ id: 'b-1' } as Baseline);

    await expect(
      service.appendStrengtheningAddition('user-1', 'b-1', 'Added leadership evidence'),
    ).resolves.toBeDefined();

    expect(baselineSectionRepository.update).toHaveBeenCalledWith(
      { id: 'section-1', baselineId: 'b-1' },
      expect.objectContaining({
        content: 'Added leadership evidence',
        updatedAt: expect.any(Date),
      }),
    );
  });
});
