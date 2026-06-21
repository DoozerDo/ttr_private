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
import { validateNormalizedResumeDocument } from '../resume/resume-normalization';
import { BaselineVersion } from './baseline-version.entity';
import { BaselineIngestionService } from './baseline-ingestion.service';
import { BaselineService, type VerifiedBaseline } from './baseline.service';
import * as structuredBaselineExtractor from './structuredBaselineExtractor';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { EmbeddingService } from '../ai/embedding.service';

describe('BaselineService - block policies', () => {
  let service: BaselineService;
  let baselineRepository: any;
  let baselineVersionRepository: any;
  let baselineSectionRepository: any;
  let baselineBlockPolicyRepository: any;
  let baselineParsedRepository: any;
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

    baselineParsedRepository = {
      findOne: jest.fn().mockResolvedValue(null),
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
          useValue: baselineParsedRepository,
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
            embed: jest.fn().mockResolvedValue([]),
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

  it('returns canonical baseline library rows from the baselines repository only', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([baseline]),
    };
    baselineRepository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

    const result = await service.listBaselinesForUser('user-1');

    expect(baselineRepository.createQueryBuilder).toHaveBeenCalledWith('baseline');
    expect(queryBuilder.select).toHaveBeenCalledWith([
      'baseline.id',
      'baseline.userId',
      'baseline.versionNumber',
      'baseline.isActive',
      'baseline.originalFilename',
      'baseline.mimeType',
      'baseline.storagePath',
      'baseline.hash',
      'baseline.status',
      'baseline.archivedAt',
      'baseline.originalBaselineScore',
      'baseline.latestBaselineScore',
      'baseline.latestAssessmentId',
      'baseline.firstAnalyzedAt',
      'baseline.lastAnalyzedAt',
      'baseline.isSynthetic',
      'baseline.syntheticScenarioKey',
      'baseline.syntheticRunId',
      'baseline.syntheticCreatedAt',
      'baseline.preserveFromCleanup',
      'baseline.createdAt',
      'baseline.updatedAt',
    ]);
    expect(queryBuilder.where).toHaveBeenCalledWith('baseline.userId = :userId', {
      userId: 'user-1',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'baseline.status = :status',
      { status: BaselineStatus.ACTIVE },
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('baseline.updatedAt', 'DESC');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'b-1',
        userId: 'user-1',
        versionNumber: expect.any(Number),
        originalFilename: 'resume.pdf',
        mimeType: 'application/pdf',
        storagePath: '/tmp/resume.pdf',
        hash: 'hash',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(queryBuilder.select.mock.calls[0][0]).not.toContain('baseline.verifiedBaseline');
    expect(result[0]).not.toHaveProperty('latestAssessmentSummary');
    expect(result[0]).not.toHaveProperty('capability');
    expect(result[0]).not.toHaveProperty('versions');
    expect(result[0]).not.toHaveProperty('sections');
    expect(result[0]).not.toHaveProperty('verifiedBaseline');
  });

  it('returns a canonical baseline library row from a production-safe raw baselines select for detail', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        id: 'b-1',
        userId: 'user-1',
        versionNumber: 1,
        isActive: true,
        originalFilename: 'resume.pdf',
        mimeType: 'application/pdf',
        storagePath: '/tmp/resume.pdf',
        hash: 'hash',
        status: BaselineStatus.ACTIVE,
        archivedAt: null,
        originalBaselineScore: 78,
        latestBaselineScore: 81,
        latestAssessmentId: null,
        firstAnalyzedAt: null,
        lastAnalyzedAt: null,
        isSynthetic: false,
        syntheticScenarioKey: null,
        syntheticRunId: null,
        syntheticCreatedAt: null,
        preserveFromCleanup: false,
        createdAt: baseline.createdAt,
        updatedAt: baseline.updatedAt,
      }),
    };
    baselineRepository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

    const result = await service.getBaselineByIdForUser('b-1', 'user-1');
    const selectedTokens = [
      queryBuilder.select.mock.calls[0][0],
      ...queryBuilder.addSelect.mock.calls.map((call: [string]) => call[0]),
    ];

    expect(baselineRepository.createQueryBuilder).toHaveBeenCalledWith('baseline');
    expect(queryBuilder.where).toHaveBeenCalledWith('baseline.id = :id', { id: 'b-1' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('baseline.userId = :userId', {
      userId: 'user-1',
    });
    expect(selectedTokens).toContain('baseline.id');
    expect(selectedTokens).toContain('baseline.userId');
    expect(selectedTokens).toContain('baseline.isActive');
    expect(selectedTokens).toContain('baseline.status');
    expect(selectedTokens).toContain('baseline.latestBaselineScore');
    expect(selectedTokens).not.toContain('baseline.*');
    expect(selectedTokens).not.toContain('baseline.verifiedBaseline');
    expect(result).toEqual(
      expect.objectContaining({
        id: 'b-1',
        userId: 'user-1',
        isActive: true,
        status: BaselineStatus.ACTIVE,
        latestBaselineScore: 81,
      }),
    );
    expect(result).not.toHaveProperty('latestAssessmentSummary');
    expect(result).not.toHaveProperty('capability');
    expect(result).not.toHaveProperty('versions');
    expect(result).not.toHaveProperty('sections');
    expect(result).not.toHaveProperty('verifiedBaseline');
  });

  it('returns archived and active rows for includeArchived=true', async () => {
    const archivedBaseline = {
      ...baseline,
      id: 'b-arch',
      status: BaselineStatus.ARCHIVED,
      archivedAt: new Date(),
    } as any;
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([baseline, archivedBaseline]),
    };
    baselineRepository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

    const result = await service.listBaselinesForUser('user-1', true);

    expect(result).toHaveLength(2);
    expect(result.map((row) => row.id)).toEqual(['b-1', 'b-arch']);
    expect(queryBuilder.where).toHaveBeenCalledWith('baseline.userId = :userId', {
      userId: 'user-1',
    });
    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    expect(queryBuilder.select.mock.calls[0][0]).not.toContain('baseline.verifiedBaseline');
  });

  it('does not call parsed, extractor, capability, assessment, version, or cap logic', async () => {
    const archivedBaseline = {
      ...baseline,
      id: 'b-arch',
      status: BaselineStatus.ARCHIVED,
      archivedAt: new Date(),
    } as any;
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([baseline, archivedBaseline]),
    };
    baselineRepository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);
    baselineParsedRepository.createQueryBuilder = jest.fn(() => {
      throw new Error('parsed repo should not be used');
    });
    fitAssessmentRepository.createQueryBuilder = jest.fn(() => {
      throw new Error('assessment repo should not be used');
    });
    baselineSectionRepository.find = jest.fn(() => {
      throw new Error('section repo should not be used');
    });
    baselineVersionRepository.find = jest.fn(() => {
      throw new Error('version repo should not be used');
    });
    const summarySpy = jest
      .spyOn(service as any, 'buildLatestAssessmentSummaryByBaselineId')
      .mockImplementation(() => {
        throw new Error('assessment summary should not be used');
      });
    const capabilitySpy = jest
      .spyOn(service as any, 'deriveCapabilityState')
      .mockImplementation(() => {
        throw new Error('capability should not be used');
      });
    const limitSpy = jest
      .spyOn(service as any, 'enforceBaselineLimit')
      .mockImplementation(async () => {
        throw new Error('legacy cap should not be used');
      });
    const extractorSpy = jest
      .spyOn(structuredBaselineExtractor, 'extractStructuredBaselineFromSections')
      .mockImplementation(() => {
        throw new Error('structured extractor should not be used');
      });
    try {
      const result = await service.listBaselinesForUser('user-1', true);

      expect(result).toHaveLength(2);
      expect(result.map((row) => row.id)).toEqual(['b-1', 'b-arch']);
      expect(queryBuilder.select.mock.calls[0][0]).not.toContain('baseline.verifiedBaseline');
      expect(baselineParsedRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(fitAssessmentRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(baselineSectionRepository.find).not.toHaveBeenCalled();
      expect(baselineVersionRepository.find).not.toHaveBeenCalled();
      expect(summarySpy).not.toHaveBeenCalled();
      expect(capabilitySpy).not.toHaveBeenCalled();
      expect(limitSpy).not.toHaveBeenCalled();
      expect(extractorSpy).not.toHaveBeenCalled();
    } finally {
      extractorSpy.mockRestore();
      summarySpy.mockRestore();
      capabilitySpy.mockRestore();
      limitSpy.mockRestore();
    }
  });

  it('persists a validated ResumeV2 model during baseline ingestion', async () => {
    const baselineForTest = { ...baseline, id: '00000000-0000-0000-0000-000000000000' };
    const manager = {
      create: jest.fn((_entity: any, value: any) => value),
      save: jest.fn(async (value: any) => value),
    } as any;

    const ingestion = {
      rawText: 'Test Resume',
      parsedSections: [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          content: 'Acme | Engineer | 2020 - Present\n- Shipped features',
        },
      ],
      canonical: {
        identity: { full_name: 'Test Person', location: 'Test City', current_title: null, current_company: null, summary: null },
        summary: null,
        experience: [
          {
            company: 'Acme',
            role: 'Engineer',
            start_date: '2020',
            end_date: 'present',
            evidence: [
              { id: 'e1', text: 'Shipped features', metrics: [], tags: ['engineer'] },
              { id: 'e2', text: 'Improved ticket resolution time by 25%', metrics: [], tags: ['engineer'] },
            ],
            company_name: 'Acme',
            role_title: 'Engineer',
            scope_summary: 'Shipped features. Improved ticket resolution time by 25%.',
            details_text: ['Shipped features', 'Improved ticket resolution time by 25%'].join('\n'),
          },
        ],
        education: [],
        skills: [],
        people_leadership: { direct_reports: null, managers_led: null, global_teams: null },
        operational_ownership: { functions_owned: [], process_design: null, process_scaling: null },
        tooling_and_platforms: { tools: [], ownership_level: 'unknown' },
        cross_functional_partnership: { product: null, engineering: null, sales_cs: null, executive: null },
        customer_advocacy: { executive_escalations: null, voice_of_customer: null, post_incident_rca: null },
        scale_and_scope: { customer_segment: 'unknown', geo_scope: 'unknown', org_stage: 'unknown' },
        metrics_and_outcomes: { metrics_present: false, metrics: [] },
        skills_and_tools: { tools: [], methodologies: [], domains: [] },
        system_generated_read_only: { missing_fields: [], ambiguity_flags: [], low_confidence_extractions: [] },
      } as any,
      sourceFormat: 'docx' as const,
    };

    await (service as any).persistParsedBaseline(manager, baselineForTest, ingestion);

    expect(manager.create).toHaveBeenCalled();
    const created = manager.create.mock.calls[0][1];
    expect(created.resumeV2Json).toBeTruthy();
    expect(created.resumeV2Json?.heading).toEqual(
      expect.objectContaining({
        name: 'Test Person',
        contactLine: 'Test City',
      }),
    );
    expect(Array.isArray(created.parsedJson?.experience)).toBe(true);
    expect(created.parsedJson.experience.length).toBeGreaterThan(0);
    expect(Array.isArray(created.resumeV2Json?.experience)).toBe(true);
    expect(created.resumeV2Json.experience.length).toBeGreaterThan(0);
    expect(created.resumeV2Json?.readiness).toEqual(
      expect.objectContaining({
        status: 'usable',
        usable: true,
      }),
    );
    expect(created.resumeV2Json?.diagnostics).toEqual(
      expect.objectContaining({
        missingRequiredFields: [],
        validationReasons: [],
      }),
    );
    expect(created.flagsJson?.reviewState).toEqual(
      expect.objectContaining({
        verified: true,
      }),
    );
    expect(created.resumeV2Json?.experience?.[0]?.evidence?.length).toBeGreaterThan(0);
    const validation = validateNormalizedResumeDocument(created.resumeV2Json);
    expect(validation.valid).toBe(true);
  });

  it('surfaces a structured error payload when ResumeV2 build fails during baseline ingestion', async () => {
    const baselineForTest = { ...baseline, id: '00000000-0000-0000-0000-000000000000' };
    const manager = {
      create: jest.fn((_entity: any, value: any) => value),
      save: jest.fn(async (value: any) => value),
    } as any;

    const ingestion = {
      rawText: 'Test Resume',
      parsedSections: [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          content: 'Acme | Engineer | 2020 - Present\n- Shipped features',
        },
      ],
      canonical: {
        // Force a schema error in BaselineSchema.parse (missing required identity fields, etc.)
        identity: null,
        summary: null,
        experience: [],
        education: [],
        skills: [],
        people_leadership: null,
        operational_ownership: null,
        tooling_and_platforms: null,
        cross_functional_partnership: null,
        customer_advocacy: null,
        scale_and_scope: null,
        metrics_and_outcomes: null,
        skills_and_tools: null,
        system_generated_read_only: { missing_fields: [], ambiguity_flags: [], low_confidence_extractions: [] },
      } as any,
      sourceFormat: 'docx' as const,
    };

    await expect((service as any).persistParsedBaseline(manager, baselineForTest, ingestion)).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: 'baseline_reparse_invalid_parsed_baseline',
          message: expect.any(String),
        }),
      }),
    });
  });

  it('does not load assessment summaries when listing baselines', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([baseline]),
    };
    baselineRepository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);
    fitAssessmentRepository.createQueryBuilder = jest.fn(() => {
      throw new Error('assessment summary loader should not be used');
    });

    await service.listBaselinesForUser('user-1');

    expect(queryBuilder.select.mock.calls[0][0]).not.toContain('baseline.verifiedBaseline');
    expect(fitAssessmentRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('does not call entity hydration, parsed, sections, version, assessment, readiness, or capability logic when reading baseline detail', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        id: 'b-1',
        userId: 'user-1',
        versionNumber: 1,
        isActive: true,
        originalFilename: 'resume.pdf',
        mimeType: 'application/pdf',
        storagePath: '/tmp/resume.pdf',
        hash: 'hash',
        status: BaselineStatus.ACTIVE,
        archivedAt: null,
        originalBaselineScore: null,
        latestBaselineScore: null,
        latestAssessmentId: null,
        firstAnalyzedAt: null,
        lastAnalyzedAt: null,
        isSynthetic: false,
        syntheticScenarioKey: null,
        syntheticRunId: null,
        syntheticCreatedAt: null,
        preserveFromCleanup: false,
        createdAt: baseline.createdAt,
        updatedAt: baseline.updatedAt,
      }),
    };
    baselineRepository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);
    baselineRepository.findOne = jest.fn(() => {
      throw new Error('findOne should not be used');
    });
    baselineRepository.findOneBy = jest.fn(() => {
      throw new Error('findOneBy should not be used');
    });
    baselineRepository.save = jest.fn(() => {
      throw new Error('save should not be used');
    });
    baselineRepository.preload = jest.fn(() => {
      throw new Error('preload should not be used');
    });
    baselineParsedRepository.findOne = jest.fn(() => {
      throw new Error('parsed repo should not be used');
    });
    fitAssessmentRepository.findOne = jest.fn(() => {
      throw new Error('assessment repo should not be used');
    });
    fitAssessmentRepository.createQueryBuilder = jest.fn(() => {
      throw new Error('assessment query builder should not be used');
    });
    baselineSectionRepository.find = jest.fn(() => {
      throw new Error('section repo should not be used');
    });
    baselineVersionRepository.find = jest.fn(() => {
      throw new Error('version repo should not be used');
    });
    const summarySpy = jest
      .spyOn(service as any, 'buildLatestAssessmentSummaryByBaselineId')
      .mockImplementation(() => {
        throw new Error('assessment summary should not be used');
      });
    const parsedSpy = jest
      .spyOn(service as any, 'getLatestParsedBaseline')
      .mockImplementation(() => {
        throw new Error('parsed baseline helper should not be used');
      });
    const capabilitySpy = jest
      .spyOn(service as any, 'deriveCapabilityState')
      .mockImplementation(() => {
        throw new Error('capability should not be used');
      });
    const readinessSpy = jest
      .spyOn(service as any, 'toBaselineReadinessSummary')
      .mockImplementation(() => {
        throw new Error('readiness summary should not be used');
      });
    const extractorSpy = jest
      .spyOn(structuredBaselineExtractor, 'extractStructuredBaselineFromSections')
      .mockImplementation(() => {
        throw new Error('structured extractor should not be used');
      });
    try {
      const result = await service.getBaselineByIdForUser('b-1', 'user-1');

      expect(result).toMatchObject({
        id: 'b-1',
        userId: 'user-1',
        status: BaselineStatus.ACTIVE,
      });
      expect(queryBuilder.getRawOne).toHaveBeenCalled();
      expect(baselineRepository.findOne).not.toHaveBeenCalled();
      expect(baselineRepository.findOneBy).not.toHaveBeenCalled();
      expect(baselineRepository.save).not.toHaveBeenCalled();
      expect(baselineRepository.preload).not.toHaveBeenCalled();
      expect(baselineParsedRepository.findOne).not.toHaveBeenCalled();
      expect(fitAssessmentRepository.findOne).not.toHaveBeenCalled();
      expect(fitAssessmentRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(baselineSectionRepository.find).not.toHaveBeenCalled();
      expect(baselineVersionRepository.find).not.toHaveBeenCalled();
      expect(summarySpy).not.toHaveBeenCalled();
      expect(parsedSpy).not.toHaveBeenCalled();
      expect(capabilitySpy).not.toHaveBeenCalled();
      expect(readinessSpy).not.toHaveBeenCalled();
      expect(extractorSpy).not.toHaveBeenCalled();
    } finally {
      summarySpy.mockRestore();
      parsedSpy.mockRestore();
      capabilitySpy.mockRestore();
      readinessSpy.mockRestore();
      extractorSpy.mockRestore();
    }
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
      findOne: jest.fn().mockResolvedValue(null),
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

  it('allows uploads regardless of the active baseline count limit', async () => {
    transactionManager.count.mockResolvedValue(19);

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

  it('returns a populated VerifiedBaseline from the baseline ingestion path', async () => {
    const result = await service.createBaseline(
      'user-1',
      { originalname: 'resume.pdf', mimetype: 'application/pdf', path: '/tmp/resume.pdf' },
      parseResult as any,
    );

    expect(result.verifiedBaseline).toBeTruthy();
    expect(result.verifiedBaseline).toMatchObject({
      sourceText: 'raw',
      experience: expect.any(Array),
      skills: expect.any(Array),
      education: expect.any(Array),
      certifications: expect.any(Array),
      evidence: expect.any(Array),
      usabilityStatus: 'valid',
      rejectionReasons: expect.any(Array),
    });
    expect(result.baseline.verifiedBaseline).toEqual(result.verifiedBaseline);
    expect(transactionManager.save).toHaveBeenCalled();
    expect(transactionManager.save.mock.calls[0][0]).toMatchObject({
      verifiedBaseline: expect.objectContaining({
        sourceText: 'raw',
        experience: expect.any(Array),
        skills: expect.any(Array),
        education: expect.any(Array),
        certifications: expect.any(Array),
        evidence: expect.any(Array),
        usabilityStatus: 'valid',
        rejectionReasons: expect.any(Array),
      }),
    });
  });

  it('returns the safe baseline library row from BaselineService retrieval without verifiedBaseline', async () => {
    const created = await service.createBaseline(
      'user-1',
      { originalname: 'resume.pdf', mimetype: 'application/pdf', path: '/tmp/resume.pdf' },
      parseResult as any,
    );
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        id: created.baselineId,
        userId: 'user-1',
        versionNumber: created.baseline.versionNumber ?? 1,
        isActive: created.baseline.isActive ?? true,
        originalFilename: created.baseline.originalFilename,
        mimeType: created.baseline.mimeType,
        storagePath: created.baseline.storagePath,
        hash: created.baseline.hash ?? null,
        status: created.baseline.status,
        archivedAt: created.baseline.archivedAt ?? null,
        originalBaselineScore: created.baseline.originalBaselineScore ?? null,
        latestBaselineScore: created.baseline.latestBaselineScore ?? null,
        latestAssessmentId: created.baseline.latestAssessmentId ?? null,
        firstAnalyzedAt: created.baseline.firstAnalyzedAt ?? null,
        lastAnalyzedAt: created.baseline.lastAnalyzedAt ?? null,
        isSynthetic: created.baseline.isSynthetic ?? false,
        syntheticScenarioKey: created.baseline.syntheticScenarioKey ?? null,
        syntheticRunId: created.baseline.syntheticRunId ?? null,
        syntheticCreatedAt: created.baseline.syntheticCreatedAt ?? null,
        preserveFromCleanup: created.baseline.preserveFromCleanup ?? false,
        createdAt: created.baseline.createdAt,
        updatedAt: created.baseline.updatedAt,
      }),
    };
    baselineRepository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);
    const fetched = await service.getBaselineByIdForUser(created.baselineId, 'user-1');
    const selectedTokens = [
      queryBuilder.select.mock.calls[0][0],
      ...queryBuilder.addSelect.mock.calls.map((call: [string]) => call[0]),
    ];

    expect(fetched).toMatchObject({
      id: created.baselineId,
      userId: 'user-1',
      originalFilename: 'resume.pdf',
    });
    expect(selectedTokens).not.toContain('baseline.verifiedBaseline');
    expect(fetched).not.toHaveProperty('verifiedBaseline');
  });

  it('returns a canonical VerifiedBaseline shape from BaselineService', async () => {
    const result = await service.createBaseline(
      'user-1',
      { originalname: 'resume.pdf', mimetype: 'application/pdf', path: '/tmp/resume.pdf' },
      parseResult as any,
    );

    const verifiedBaseline: VerifiedBaseline | null | undefined = result.verifiedBaseline;
    expect(verifiedBaseline).toBeTruthy();
    expect(verifiedBaseline).toMatchObject({
      sourceText: 'raw',
      experience: expect.any(Array),
      skills: expect.any(Array),
      education: expect.any(Array),
      certifications: expect.any(Array),
      evidence: expect.any(Array),
      usabilityStatus: 'valid',
      rejectionReasons: [],
    });
  });

  it('marks a structurally malformed baseline as invalid without changing resume content handling', () => {
    const verifiedBaseline = (service as any).buildVerifiedBaseline({
      sourceText: '',
      ingestion: null,
      sections: [],
    });

    expect(verifiedBaseline).toMatchObject({
      usabilityStatus: 'invalid',
      rejectionReasons: ['baseline_unreadable_or_unmappable'],
    });
  });

  it('does not invalidate a baseline solely because resume content is missing', () => {
    const verifiedBaseline = (service as any).buildVerifiedBaseline({
      sourceText: '',
      ingestion: {
        rawText: '',
        parsedSections: [],
        canonical: {
          identity: {
            full_name: 'Test User',
            summary: null,
            current_title: null,
            current_company: null,
            location: null,
          },
          experience: [],
          education: [],
          skills: [],
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
          schema_version: 'baseline_schema_v1',
          user_verified: false,
        },
        sourceFormat: 'docx',
      } as any,
      sections: [],
    });

    expect(verifiedBaseline).toMatchObject({
      usabilityStatus: 'valid',
      rejectionReasons: [],
    });
  });

  it('returns a structured duplicate conflict when the same file hash exists on an active baseline', async () => {
    baselineRepository.findOne.mockImplementation(async ({ where }: any) => {
      if (where?.hash && where?.userId === 'user-1') {
        return {
          id: 'baseline-dup',
          userId: 'user-1',
          hash: 'hash-1',
          status: BaselineStatus.ACTIVE,
          isActive: true,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
        } as any;
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

  it('reuses archived baselines when the same resume hash is uploaded again (no 500)', async () => {
    const persistParsedBaselineSpy = jest
      .spyOn(service as any, 'persistParsedBaseline')
      .mockResolvedValue(undefined);

    baselineRepository.findOne.mockImplementation(async ({ where }: any) => {
      if (where?.hash && where?.userId === 'user-1') {
        return {
          id: 'baseline-archived',
          userId: 'user-1',
          hash: 'hash-1',
          status: BaselineStatus.ARCHIVED,
          isActive: false,
          archivedAt: new Date('2026-03-01T00:00:00.000Z'),
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          sections: [],
        } as any;
      }
      return null;
    });

    // No active current baseline exists; revived baseline should become current.
    transactionManager.count.mockImplementation(async (_entity: any, options: any) => {
      if (options?.where?.isActive === true) return 0;
      return 0;
    });
    transactionManager.findOne.mockResolvedValue({
      id: 'baseline-archived',
      userId: 'user-1',
      hash: 'hash-1',
      status: BaselineStatus.ACTIVE,
      isActive: true,
      archivedAt: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      sections: [],
    } as any);

    const result = await service.createBaseline(
      'user-1',
      { originalname: 'resume.pdf', mimetype: 'application/pdf', path: '/tmp/resume.pdf' },
      parseResult as any,
    );

    expect(result.baselineId).toBe('baseline-archived');
    expect(result.baseline.status).toBe(BaselineStatus.ACTIVE);
    expect(result.baseline.isActive).toBe(true);
    expect(persistParsedBaselineSpy).toHaveBeenCalledTimes(1);
    expect(transactionManager.delete).toHaveBeenCalledWith(BaselineSection, { baselineId: 'baseline-archived' });
    expect(
      transactionManager.save.mock.calls.some(
        (call: any[]) =>
          call.length >= 1 &&
          !Array.isArray(call[0]) &&
          call[0]?.baselineId === 'baseline-archived' &&
          typeof call[0]?.versionNumber === 'number',
      ),
    ).toBe(true);
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
  let embeddingService: any;
  const baselineUuid = '00000000-0000-4000-8000-000000000001';
  const sections: BaselineSection[] = [
    {
      id: 's-1',
      baselineId: baselineUuid,
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
    id: baselineUuid,
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
            update: jest.fn(async () => ({ affected: 1 })),
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
            embed: jest.fn().mockResolvedValue([]),
            embedText: jest.fn().mockResolvedValue([]),
            embedTexts: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get(BaselineService);
    embeddingService = module.get(EmbeddingService);
  });

  it('preserves newlines in sanitizeSectionContent', () => {
    const sanitized = (service as any).sanitizeSectionContent('line 1\r\nline 2\n\tline 3\u0000');
    expect(sanitized).toContain('line 1\nline 2\n\tline 3');
    expect(sanitized).not.toContain('\u0000');
  });

  it('allows short raw uploads when structured sections are usable', async () => {
    ingestionService.ingest.mockResolvedValue({
      rawText: 'short text',
      parsedSections: [
        {
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Acme | Engineer\n- Shipped features',
          includePolicy: BaselineIncludePolicy.OPTIONAL,
          order: 0,
        },
      ],
      canonical: canonicalBaseline,
      sourceFormat: 'docx',
    });

    const result = await service.buildSectionsFromFile({
      originalname: 'resume.pdf',
      mimetype: 'application/pdf',
      path: '/tmp/resume.pdf',
    } as Express.Multer.File);

    expect(result.sections.length).toBeGreaterThan(1);
    expect(result.sections[1]).toMatchObject({
      sectionType: BaselineSectionType.EXPERIENCE,
      content: expect.stringContaining('Acme | Engineer'),
    });
  });

  it('still rejects empty or unreadable uploads with insufficient_extracted_text', async () => {
    ingestionService.ingest.mockResolvedValue({
      rawText: '',
      parsedSections: [],
      canonical: canonicalBaseline,
      sourceFormat: 'docx',
    });

    await expect(
      service.buildSectionsFromFile({
        originalname: 'resume.pdf',
        mimetype: 'application/pdf',
        path: '/tmp/resume.pdf',
      } as Express.Multer.File),
    ).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({
        code: 'insufficient_extracted_text',
        message: 'We could not extract enough text from that resume.',
      }),
    });
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

  it('reparseBaselineForUser does not 500 when embeddings fail (embeddings are advisory)', async () => {
    const canonical = {
      ...canonicalBaseline,
      schema_version: 'baseline_schema_v1',
    } as any;

    ingestionService.ingest.mockResolvedValue({
      rawText: 'from file',
      parsedSections: [],
      canonical,
      sourceFormat: 'pdf',
    });

    baselineRepository.findOne.mockResolvedValue({
      ...baseline,
      sections: [
        {
          ...sections[0],
          sectionType: BaselineSectionType.RAW,
          content: 'raw baseline text',
        },
      ],
    } as Baseline);

    // Force embedding provider failure.
    embeddingService.embed.mockRejectedValue(new Error('embedding provider down'));

    // Ensure policy/version queries don't block.
    (service as any).baselineVersionRepository.findOne.mockResolvedValue(null);
    (service as any).baselineBlockPolicyRepository.find.mockResolvedValue([]);

    // This test targets the embedding failure tolerance specifically; parsing/ResumeV2 shape is covered elsewhere.
    (service as any).persistParsedBaseline = jest.fn().mockResolvedValue(undefined);

    await expect(service.reparseBaselineForUser(baselineUuid, 'user-1')).resolves.toBeTruthy();
  });

  it('reparseBaselineForUser returns 409 baseline_reparse_missing_source when no stored file and no raw text exist', async () => {
    baselineRepository.findOne.mockResolvedValue({
      ...baseline,
      storagePath: null,
      sections: [],
    } as Baseline);

    await expect(service.reparseBaselineForUser(baselineUuid, 'user-1')).rejects.toMatchObject({
      getStatus: expect.any(Function),
      getResponse: expect.any(Function),
    });

    try {
      await service.reparseBaselineForUser(baselineUuid, 'user-1');
    } catch (error: any) {
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ code: 'baseline_reparse_missing_source' });
      expect(error.getStatus()).not.toBe(500);
    }
  });

  it('reparseBaselineForUser returns 422 baseline_reparse_ingestion_failed when fallback ingestFromText throws', async () => {
    ingestionService.ingest.mockRejectedValue(new Error('missing file'));
    ingestionService.ingestFromText.mockRejectedValue(new Error('empty resume text'));

    baselineRepository.findOne.mockResolvedValue({
      ...baseline,
      storagePath: '/missing/path',
      sections: [
        {
          ...sections[0],
          sectionType: BaselineSectionType.RAW,
          content: '',
        },
      ],
    } as Baseline);

    try {
      await service.reparseBaselineForUser(baselineUuid, 'user-1');
    } catch (error: any) {
      expect(error.getStatus()).toBe(422);
      expect(error.getResponse()).toMatchObject({ code: 'baseline_reparse_ingestion_failed' });
      expect(error.getStatus()).not.toBe(500);
    }
  });

  it('reparseBaselineForUser returns typed 422 baseline_resume_v2_* when canonical payload cannot produce usable Resume V2 experience', async () => {
    // This payload can pass baseline schema parsing but still be structurally unusable for Resume V2 (no usable experience).
    const canonical = { ...canonicalBaseline } as any;

    ingestionService.ingest.mockResolvedValue({
      rawText: 'from file',
      parsedSections: [],
      canonical,
      sourceFormat: 'pdf',
    });

    baselineRepository.findOne.mockResolvedValue({
      ...baseline,
      sections: [
        {
          ...sections[0],
          sectionType: BaselineSectionType.RAW,
          content: 'raw baseline text',
        },
      ],
    } as Baseline);

    // Ensure policy/version queries don't block.
    (service as any).baselineVersionRepository.findOne.mockResolvedValue(null);
    (service as any).baselineBlockPolicyRepository.find.mockResolvedValue([]);

    try {
      await service.reparseBaselineForUser(baselineUuid, 'user-1');
    } catch (error: any) {
      expect(error.getStatus()).toBe(422);
      expect(error.getResponse()).toMatchObject({
        error: expect.objectContaining({
          code: expect.stringMatching(/^baseline_resume_v2_/),
        }),
      });
      expect(error.getStatus()).not.toBe(500);
    }
  });

  it('reparseBaselineForUser returns 422 baseline_reparse_section_rebuild_failed when section rebuild throws', async () => {
    const canonical = {
      ...canonicalBaseline,
      schema_version: 'baseline_schema_v1',
    } as any;

    ingestionService.ingest.mockResolvedValue({
      rawText: 'from file',
      parsedSections: [],
      canonical,
      sourceFormat: 'pdf',
    });

    baselineRepository.findOne.mockResolvedValue({
      ...baseline,
      sections: [
        {
          ...sections[0],
          sectionType: BaselineSectionType.RAW,
          content: 'raw baseline text',
        },
      ],
    } as Baseline);

    jest
      .spyOn(service as any, 'buildSections')
      .mockImplementation(() => {
        throw new Error('rebuild failed');
      });

    try {
      await service.reparseBaselineForUser(baselineUuid, 'user-1');
    } catch (error: any) {
      expect(error.getStatus()).toBe(422);
      expect(error.getResponse()).toMatchObject({
        code: 'baseline_reparse_section_rebuild_failed',
      });
      expect(error.getStatus()).not.toBe(500);
    }
  });

  it('reparseBaselineForUser returns 422 baseline_reparse_persistence_failed when transaction persistence throws', async () => {
    const canonical = {
      ...canonicalBaseline,
      schema_version: 'baseline_schema_v1',
    } as any;

    ingestionService.ingest.mockResolvedValue({
      rawText: 'from file',
      parsedSections: [],
      canonical,
      sourceFormat: 'pdf',
    });

    baselineRepository.findOne.mockResolvedValue({
      ...baseline,
      sections: [
        {
          ...sections[0],
          sectionType: BaselineSectionType.RAW,
          content: 'raw baseline text',
        },
      ],
    } as Baseline);

    (service as any).persistParsedBaseline = jest.fn().mockResolvedValue(undefined);
    (service as any).baselineVersionRepository.findOne.mockResolvedValue(null);
    (service as any).baselineBlockPolicyRepository.find.mockResolvedValue([]);

    baselineRepository.manager.transaction.mockImplementationOnce(async (cb: any) =>
      cb({
        create: jest.fn((_: any, payload: any) => payload),
        save: jest.fn(async (value: any) => value),
        delete: jest.fn(async () => {
          throw new Error('db delete failed');
        }),
      }),
    );

    try {
      await service.reparseBaselineForUser(baselineUuid, 'user-1');
    } catch (error: any) {
      expect(error.getStatus()).toBe(422);
      expect(error.getResponse()).toMatchObject({
        code: 'baseline_reparse_persistence_failed',
      });
      expect(error.getStatus()).not.toBe(500);
    }
  });

  it('reparseBaselineForUser does not save parent baseline with partial versions relation after Resume V2 persistence', async () => {
    const canonical = {
      ...canonicalBaseline,
      schema_version: 'baseline_schema_v1',
    } as any;

    ingestionService.ingest.mockResolvedValue({
      rawText: 'from file',
      parsedSections: [],
      canonical,
      sourceFormat: 'pdf',
    });

    baselineRepository.findOne.mockResolvedValue({
      ...baseline,
      sections: [
        {
          ...sections[0],
          sectionType: BaselineSectionType.RAW,
          content: 'raw baseline text',
        },
      ],
      versions: [{ id: 'existing-version-id', baselineId: baselineUuid, versionNumber: 1 }],
    } as Baseline);

    const txSave = jest.fn(async (value: any) => {
      if (value?.id === baselineUuid && Array.isArray(value?.versions)) {
        throw new Error('parent baseline save with versions relation is not allowed');
      }
      if (value?.baselineId === baselineUuid && value?.versionNumber === 2 && !value?.id) {
        return { ...value, id: 'new-version-id' };
      }
      return value;
    });
    const txUpdate = jest.fn(async () => ({ affected: 1 }));

    baselineRepository.manager.transaction.mockImplementationOnce(async (cb: any) =>
      cb({
        create: jest.fn((_: any, payload: any) => payload),
        save: txSave,
        update: txUpdate,
        delete: jest.fn(),
      }),
    );

    (service as any).persistParsedBaseline = jest.fn().mockResolvedValue(undefined);
    (service as any).baselineVersionRepository.findOne.mockResolvedValue({
      id: 'existing-version-id',
      baselineId: baselineUuid,
      versionNumber: 1,
      verifiedAdditions: [],
    });
    (service as any).baselineBlockPolicyRepository.find.mockResolvedValue([]);

    const result = await service.reparseBaselineForUser(baselineUuid, 'user-1');

    expect(result.versions?.[0]?.id).toBe('new-version-id');
    expect(txUpdate).toHaveBeenCalledWith(
      Baseline,
      { id: baselineUuid, userId: 'user-1' },
      expect.objectContaining({ version: 2, versionNumber: 2, isActive: true }),
    );
    expect(txSave).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: baselineUuid, versions: expect.any(Array) }),
    );
  });

  it('reparseBaselineForUser returns new usable baseline version payload without detaching baseline_versions ownership', async () => {
    const canonical = {
      ...canonicalBaseline,
      schema_version: 'baseline_schema_v1',
    } as any;

    ingestionService.ingest.mockResolvedValue({
      rawText: 'from file',
      parsedSections: [],
      canonical,
      sourceFormat: 'pdf',
    });

    baselineRepository.findOne.mockResolvedValue({
      ...baseline,
      sections: [
        {
          ...sections[0],
          sectionType: BaselineSectionType.RAW,
          content: 'raw baseline text',
        },
      ],
      versions: [{ id: 'existing-version-id', baselineId: baselineUuid, versionNumber: 1 }],
    } as Baseline);

    const txSave = jest.fn(async (value: any) => {
      if (value?.id === baselineUuid && Array.isArray(value?.versions)) {
        throw new Error('unexpected parent baseline save with partial versions');
      }
      if (value?.baselineId === baselineUuid && value?.versionNumber === 2 && !value?.id) {
        return { ...value, id: 'new-usable-version-id' };
      }
      return value;
    });
    const txUpdate = jest.fn(async () => ({ affected: 1 }));
    const txDelete = jest.fn();
    const txCreate = jest.fn((_: any, payload: any) => payload);

    baselineRepository.manager.transaction.mockImplementationOnce(async (cb: any) =>
      cb({
        create: txCreate,
        save: txSave,
        update: txUpdate,
        delete: txDelete,
      }),
    );

    const persistParsedBaselineSpy = jest
      .spyOn(service as any, 'persistParsedBaseline')
      .mockResolvedValue(undefined);

    (service as any).baselineVersionRepository.findOne.mockResolvedValue({
      id: 'existing-version-id',
      baselineId: baselineUuid,
      versionNumber: 1,
      verifiedAdditions: [],
    });
    (service as any).baselineBlockPolicyRepository.find.mockResolvedValue([]);

    const result = await service.reparseBaselineForUser(baselineUuid, 'user-1');

    expect(result.id).toBe(baselineUuid);
    expect(result.version).toBe(2);
    expect(result.versionNumber).toBe(2);
    expect(result.versions?.[0]?.id).toBe('new-usable-version-id');
    expect(result.versions?.[0]?.baselineId).toBe(baselineUuid);
    expect(persistParsedBaselineSpy).toHaveBeenCalledTimes(1);

    expect(txSave).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: baselineUuid, versions: expect.any(Array) }),
    );
    expect(txUpdate).not.toHaveBeenCalledWith(
      BaselineVersion,
      expect.anything(),
      expect.objectContaining({ baselineId: null }),
    );
    expect(txUpdate).toHaveBeenCalledWith(
      Baseline,
      { id: baselineUuid, userId: 'user-1' },
      expect.objectContaining({ version: 2, versionNumber: 2, isActive: true }),
    );
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
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
    };

    baselineRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
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
    baselineRepository.createQueryBuilder.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        id: baselineRecord.id,
        userId: baselineRecord.userId,
        versionNumber: 1,
        isActive: true,
        originalFilename: 'resume.pdf',
        mimeType: 'application/pdf',
        storagePath: '/tmp/resume.pdf',
        hash: 'hash',
        status: BaselineStatus.ACTIVE,
        archivedAt: null,
        originalBaselineScore: 45,
        latestBaselineScore: 45,
        latestAssessmentId: 'assessment-readiness-1',
        firstAnalyzedAt: new Date('2026-03-25T10:00:00.000Z'),
        lastAnalyzedAt: new Date('2026-03-25T10:00:00.000Z'),
        isSynthetic: false,
        syntheticScenarioKey: null,
        syntheticRunId: null,
        syntheticCreatedAt: null,
        preserveFromCleanup: false,
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-25T10:00:00.000Z'),
      }),
    }));
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

  it('allows archiving the current baseline by promoting the next available baseline (or leaving none current)', async () => {
    const archiveManager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'b-3',
        userId: 'user-1',
        status: BaselineStatus.ACTIVE,
        isActive: true,
      }),
      find: jest.fn().mockResolvedValue([
        { id: 'b-3', userId: 'user-1', status: BaselineStatus.ACTIVE, isActive: true, createdAt: new Date('2026-03-03') },
        { id: 'b-2', userId: 'user-1', status: BaselineStatus.ACTIVE, isActive: false, createdAt: new Date('2026-03-02') },
      ]),
      update: jest.fn(),
    };
    baselineRepository.manager.transaction.mockImplementation(async (cb: any) => cb(archiveManager));

    await expect(service.archiveBaseline('user-1', 'b-3')).resolves.toBeTruthy();
    expect(archiveManager.update).toHaveBeenCalled();
  });

  it('sets a new current baseline and demotes the previous current baseline', async () => {
    const store = new Map<string, any>([
      [
        'b-1',
        {
          id: 'b-1',
          userId: 'user-1',
          status: BaselineStatus.ACTIVE,
          isActive: true,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      ],
      [
        'b-2',
        {
          id: 'b-2',
          userId: 'user-1',
          status: BaselineStatus.ACTIVE,
          isActive: false,
          createdAt: new Date('2026-03-02T00:00:00.000Z'),
        },
      ],
    ]);

    let queryInvocation = 0;
    const manager = {
      update: jest.fn(async (_entity: any, criteria: any, partial: any) => {
        let affected = 0;
        for (const baseline of store.values()) {
          if (baseline.userId !== criteria.userId) continue;
          if (criteria.id && baseline.id !== criteria.id) continue;
          Object.assign(baseline, partial);
          affected += 1;
        }
        return { affected };
      }),
      findOne: jest.fn(() => {
        throw new Error('findOne should not be used');
      }),
      findOneBy: jest.fn(() => {
        throw new Error('findOneBy should not be used');
      }),
      save: jest.fn(() => {
        throw new Error('save should not be used');
      }),
      preload: jest.fn(() => {
        throw new Error('preload should not be used');
      }),
      createQueryBuilder: jest.fn(() => {
        queryInvocation += 1;
        return {
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockImplementation(async () =>
            queryInvocation === 1
              ? { id: 'b-2', userId: 'user-1', status: BaselineStatus.ACTIVE }
              : store.get('b-2'),
          ),
        };
      }),
    };

    baselineRepository.manager.transaction.mockImplementation(async (cb: any) => cb(manager));

    const updated = await service.setCurrentBaseline('user-1', 'b-2');

    expect(updated.isActive).toBe(true);
    expect(updated.id).toBe('b-2');
    expect(store.get('b-1')?.isActive).toBe(false);
    expect(store.get('b-2')?.isActive).toBe(true);
    expect(manager.update).toHaveBeenCalledTimes(2);
    expect(manager.findOne).not.toHaveBeenCalled();
    expect(manager.createQueryBuilder).toHaveBeenCalledWith(Baseline, 'baseline');
  });

  it('returns the safe library row shape when setting current baseline', async () => {
    const selected = {
      id: 'b-2',
      userId: 'user-1',
      versionNumber: 2,
      status: BaselineStatus.ACTIVE,
      isActive: true,
      originalFilename: 'resume-2.pdf',
      mimeType: 'application/pdf',
      storagePath: '/tmp/resume-2.pdf',
      hash: 'hash-2',
      archivedAt: null,
      originalBaselineScore: null,
      latestBaselineScore: null,
      latestAssessmentId: null,
      firstAnalyzedAt: null,
      lastAnalyzedAt: null,
      isSynthetic: false,
      syntheticScenarioKey: null,
      syntheticRunId: null,
      syntheticCreatedAt: null,
      preserveFromCleanup: false,
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    } as any;
    const select = jest.fn().mockReturnThis();
    const addSelect = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnThis();
    const andWhere = jest.fn().mockReturnThis();
    const getRawOne = jest
      .fn()
      .mockResolvedValueOnce({ id: 'b-2', userId: 'user-1', status: BaselineStatus.ACTIVE })
      .mockResolvedValueOnce(selected);
    const manager = {
      update: jest.fn(async () => ({ affected: 1 })),
      findOne: jest.fn(() => {
        throw new Error('findOne should not be used');
      }),
      findOneBy: jest.fn(() => {
        throw new Error('findOneBy should not be used');
      }),
      save: jest.fn(() => {
        throw new Error('save should not be used');
      }),
      preload: jest.fn(() => {
        throw new Error('preload should not be used');
      }),
      createQueryBuilder: jest.fn(() => ({
        select,
        addSelect,
        where,
        andWhere,
        getRawOne,
      })),
    };
    baselineRepository.manager.transaction.mockImplementation(async (cb: any) => cb(manager));

    const result = await service.setCurrentBaseline('user-1', 'b-2');

    const selectedColumns = [
      ['baseline.id', 'id'],
      ['baseline.userId', 'userId'],
      ['baseline.versionNumber', 'versionNumber'],
      ['baseline.isActive', 'isActive'],
      ['baseline.originalFilename', 'originalFilename'],
      ['baseline.mimeType', 'mimeType'],
      ['baseline.storagePath', 'storagePath'],
      ['baseline.hash', 'hash'],
      ['baseline.status', 'status'],
      ['baseline.archivedAt', 'archivedAt'],
      ['baseline.originalBaselineScore', 'originalBaselineScore'],
      ['baseline.latestBaselineScore', 'latestBaselineScore'],
      ['baseline.latestAssessmentId', 'latestAssessmentId'],
      ['baseline.firstAnalyzedAt', 'firstAnalyzedAt'],
      ['baseline.lastAnalyzedAt', 'lastAnalyzedAt'],
      ['baseline.isSynthetic', 'isSynthetic'],
      ['baseline.syntheticScenarioKey', 'syntheticScenarioKey'],
      ['baseline.syntheticRunId', 'syntheticRunId'],
      ['baseline.syntheticCreatedAt', 'syntheticCreatedAt'],
      ['baseline.preserveFromCleanup', 'preserveFromCleanup'],
      ['baseline.createdAt', 'createdAt'],
      ['baseline.updatedAt', 'updatedAt'],
    ];
    expect(select).toHaveBeenCalledWith('baseline.id', 'id');
    const selectedTokens = [select.mock.calls[0], ...addSelect.mock.calls].flat();
    expect(selectedColumns.flat().every((token) => selectedTokens.includes(token))).toBe(true);
    expect(selectedTokens).not.toContain('baseline.*');
    expect(selectedTokens).not.toContain('baseline.verifiedBaseline');
    expect(result).not.toHaveProperty('verifiedBaseline');
    expect(result).not.toHaveProperty('latestAssessmentSummary');
    expect(result).not.toHaveProperty('capability');
    expect(result).not.toHaveProperty('versions');
  });

  it('does not call parsed, extractor, capability, assessment, version, or cap logic when setting current baseline', async () => {
    const selected = {
      id: 'b-2',
      userId: 'user-1',
      versionNumber: 2,
      status: BaselineStatus.ACTIVE,
      isActive: false,
      originalFilename: 'resume-2.pdf',
      mimeType: 'application/pdf',
      storagePath: '/tmp/resume-2.pdf',
      hash: 'hash-2',
      archivedAt: null,
      originalBaselineScore: null,
      latestBaselineScore: null,
      latestAssessmentId: null,
      firstAnalyzedAt: null,
      lastAnalyzedAt: null,
      isSynthetic: false,
      syntheticScenarioKey: null,
      syntheticRunId: null,
      syntheticCreatedAt: null,
      preserveFromCleanup: false,
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    } as any;
    const manager = {
      update: jest.fn(async () => ({ affected: 1 })),
      findOne: jest.fn(async (_entity: any, options: any) => {
        const id = options?.where?.id as string | undefined;
        const userId = options?.where?.userId as string | undefined;
        if (!id || !userId) return null;
        const value = store.get(id);
        return value && value.userId === userId ? value : null;
      }),
      findOneBy: jest.fn(() => {
        throw new Error('findOneBy should not be used');
      }),
      save: jest.fn(() => {
        throw new Error('save should not be used');
      }),
      preload: jest.fn(() => {
        throw new Error('preload should not be used');
      }),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest
          .fn()
          .mockResolvedValueOnce({ id: 'b-2', userId: 'user-1', status: BaselineStatus.ACTIVE })
          .mockResolvedValueOnce({ ...selected, isActive: true }),
      })),
    };
    baselineRepository.manager.transaction.mockImplementation(async (cb: any) => cb(manager));
    (service as any).baselineParsedRepository.createQueryBuilder = jest.fn(() => {
      throw new Error('parsed repo should not be used');
    });
    fitAssessmentRepository.createQueryBuilder = jest.fn(() => {
      throw new Error('assessment repo should not be used');
    });
    (service as any).baselineSectionRepository.find = jest.fn(() => {
      throw new Error('section repo should not be used');
    });
    (service as any).baselineVersionRepository.find = jest.fn(() => {
      throw new Error('version repo should not be used');
    });
    const summarySpy = jest
      .spyOn(service as any, 'buildLatestAssessmentSummaryByBaselineId')
      .mockImplementation(() => {
        throw new Error('assessment summary should not be used');
      });
    const capabilitySpy = jest
      .spyOn(service as any, 'deriveCapabilityState')
      .mockImplementation(() => {
        throw new Error('capability should not be used');
      });
    const limitSpy = jest
      .spyOn(service as any, 'enforceBaselineLimit')
      .mockImplementation(async () => {
        throw new Error('legacy cap should not be used');
      });
    const extractorSpy = jest
      .spyOn(structuredBaselineExtractor, 'extractStructuredBaselineFromSections')
      .mockImplementation(() => {
        throw new Error('structured extractor should not be used');
      });

    try {
      const result = await service.setCurrentBaseline('user-1', 'b-2');

      expect(result.id).toBe('b-2');
      expect(manager.findOne).not.toHaveBeenCalled();
      expect(manager.findOneBy).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.preload).not.toHaveBeenCalled();
      expect((service as any).baselineParsedRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(fitAssessmentRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect((service as any).baselineSectionRepository.find).not.toHaveBeenCalled();
      expect((service as any).baselineVersionRepository.find).not.toHaveBeenCalled();
      expect(summarySpy).not.toHaveBeenCalled();
      expect(capabilitySpy).not.toHaveBeenCalled();
      expect(limitSpy).not.toHaveBeenCalled();
      expect(extractorSpy).not.toHaveBeenCalled();
    } finally {
      extractorSpy.mockRestore();
      summarySpy.mockRestore();
      capabilitySpy.mockRestore();
      limitSpy.mockRestore();
    }
  });

  it('allows archiving a former current baseline immediately after switching current baseline', async () => {
    const store = new Map<string, any>([
      [
        'b-1',
        {
          id: 'b-1',
          userId: 'user-1',
          status: BaselineStatus.ACTIVE,
          isActive: true,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          archivedAt: null,
        },
      ],
      [
        'b-2',
        {
          id: 'b-2',
          userId: 'user-1',
          status: BaselineStatus.ACTIVE,
          isActive: false,
          createdAt: new Date('2026-03-02T00:00:00.000Z'),
          archivedAt: null,
        },
      ],
    ]);

    const manager = {
      findOne: jest.fn(async (_entity: any, options: any) => {
        const id = options?.where?.id as string | undefined;
        const userId = options?.where?.userId as string | undefined;
        if (!id || !userId) return null;
        const value = store.get(id);
        return value && value.userId === userId ? value : null;
      }),
      find: jest.fn(async (entity: any, options: any) => {
        if (entity !== Baseline) return [];
        if (options?.where?.userId !== 'user-1') return [];
        return [...store.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }),
      update: jest.fn(async (_entity: any, criteria: any, partial: any) => {
        let affected = 0;
        for (const baseline of store.values()) {
          if (baseline.userId !== criteria.userId) continue;
          if (criteria.id && baseline.id !== criteria.id) continue;
          Object.assign(baseline, partial);
          affected += 1;
        }
        return { affected };
      }),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest
          .fn()
          .mockResolvedValueOnce({ id: 'b-2', userId: 'user-1', status: BaselineStatus.ACTIVE })
          .mockResolvedValueOnce(store.get('b-2')),
      })),
    };

    baselineRepository.manager.transaction.mockImplementation(async (cb: any) => cb(manager));

    await service.setCurrentBaseline('user-1', 'b-2');

    const archived = await service.archiveBaseline('user-1', 'b-1');
    expect(archived.status).toBe(BaselineStatus.ARCHIVED);
    expect(archived.isActive).toBe(false);
    expect(store.get('b-2')?.isActive).toBe(true);

    const archivedCurrent = await service.archiveBaseline('user-1', 'b-2');
    expect(archivedCurrent.status).toBe(BaselineStatus.ARCHIVED);
    expect(archivedCurrent.isActive).toBe(false);
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
