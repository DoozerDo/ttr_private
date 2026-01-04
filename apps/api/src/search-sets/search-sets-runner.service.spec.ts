import { FitAssessment, FitAssessmentVerdict } from '../analysis/fit-assessment.entity';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import {
  SearchSet,
  SearchSetSeniority,
  SearchSetWorkMode,
} from './search-set.entity';
import { SearchSetsRunnerService } from './search-sets-runner.service';
import { SearchSetsService } from './search-sets.service';

describe('SearchSetsRunnerService', () => {
  const baseSearchSet: SearchSet = {
    id: 'set-1',
    userId: 'user-1',
    titlePatterns: ['Engineer'],
    seniority: SearchSetSeniority.ANY,
    industry: [],
    workMode: SearchSetWorkMode.ANY,
    sourceUrl: null,
    urlBacked: false,
    parseWarning: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createJob = (overrides: Partial<Job> & Record<string, unknown> = {}): Job =>
    ({
      id: overrides.id ?? 'job-1',
      userId: overrides.userId ?? 'user-1',
      title: overrides.title ?? 'Senior Engineer',
      company: overrides.company ?? 'Acme Corp',
      rawDescription: overrides.rawDescription ?? 'Remote friendly role',
      sourceUrl: overrides.sourceUrl ?? null,
      normalizedResponsibilities: overrides.normalizedResponsibilities ?? [],
      normalizedRequirements: overrides.normalizedRequirements ?? [],
      jdIngestionMethod: overrides.jdIngestionMethod ?? JobIngestionMethod.PASTE,
      jdParsedAt: overrides.jdParsedAt ?? new Date(),
      createdAt: overrides.createdAt ?? new Date(),
      updatedAt: overrides.updatedAt ?? new Date(),
      ...overrides,
    } as Job);

  const createFitAssessment = (overrides: Partial<FitAssessment>): FitAssessment =>
    ({
      id: overrides.id ?? 'assessment-1',
      userId: overrides.userId ?? 'user-1',
      jobId: overrides.jobId ?? 'job-1',
      baselineId: overrides.baselineId ?? 'baseline-1',
      baselineVersion: overrides.baselineVersion ?? 1,
      overallScore: overrides.overallScore ?? 80,
      verdict: overrides.verdict ?? FitAssessmentVerdict.CONSIDER,
      dimensionScores:
        overrides.dimensionScores ??
        ({
          experienceAlignment: 1,
          leadershipLevel: 1,
          technicalPlatformFit: 1,
          industryContext: 1,
          strategicTacticalFit: 1,
        } as FitAssessment['dimensionScores']),
      strengths: overrides.strengths ?? [],
      gaps: overrides.gaps ?? [],
      complianceFlags: overrides.complianceFlags ?? [],
      inputsHash: overrides.inputsHash ?? null,
      createdAt: overrides.createdAt ?? new Date(),
    } as FitAssessment);

  const createQueryBuilder = () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    return qb;
  };

  const createService = ({
    jobs = [createJob()],
    searchSet = baseSearchSet,
    assessments = [createFitAssessment({ overallScore: 90 })],
  }: {
    jobs?: Job[];
    searchSet?: SearchSet;
    assessments?: FitAssessment[];
  }) => {
    const jobRepository = {
      find: jest.fn().mockResolvedValue(jobs),
    };

    const qb = createQueryBuilder();
    qb.getMany.mockResolvedValue(assessments);

    const fitAssessmentRepository = {
      createQueryBuilder: jest.fn(() => qb),
    };

    const searchSetsService = {
      getSearchSetForUser: jest.fn().mockResolvedValue(searchSet),
    } as unknown as jest.Mocked<SearchSetsService>;

    const service = new SearchSetsRunnerService(
      jobRepository as never,
      searchSetsService,
      fitAssessmentRepository as never,
    );

    return { service, jobRepository, fitAssessmentRepository, searchSetsService, qb };
  };

  it('filters jobs by title pattern and attaches latest fit assessment', async () => {
    const newerAssessment = createFitAssessment({
      id: 'assessment-2',
      createdAt: new Date('2024-01-02T00:00:00Z'),
      overallScore: 95,
      verdict: FitAssessmentVerdict.APPLY,
    });
    const olderAssessment = createFitAssessment({
      id: 'assessment-1',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      overallScore: 80,
      verdict: FitAssessmentVerdict.CONSIDER,
    });

    const { service, fitAssessmentRepository } = createService({
      jobs: [createJob({ sourceUrl: 'https://example.com/apply' })],
      assessments: [newerAssessment, olderAssessment],
    });

    const results = await service.runSearchSet('set-1', 'user-1', 5);

    expect(fitAssessmentRepository.createQueryBuilder).toHaveBeenCalled();
    expect(results).toEqual([
      {
        jobId: 'job-1',
        title: 'Senior Engineer',
        company: 'Acme Corp',
        applyUrl: 'https://example.com/apply',
        sourceUrl: 'https://example.com/apply',
        fitScore: 95,
        verdict: FitAssessmentVerdict.APPLY,
      },
    ]);
  });

  it('applies work mode and seniority filters', async () => {
    const { service } = createService({
      jobs: [
        createJob({
          id: 'job-remote',
          title: 'Senior Engineer',
          rawDescription: 'Fully remote position',
        }),
        createJob({
          id: 'job-onsite',
          title: 'Junior Engineer',
          rawDescription: 'Onsite role',
        }),
      ],
      searchSet: {
        ...baseSearchSet,
        titlePatterns: ['Engineer'],
        workMode: SearchSetWorkMode.REMOTE,
        seniority: SearchSetSeniority.SENIOR,
      },
      assessments: [],
    });

    const results = await service.runSearchSet('set-1', 'user-1', 10);

    expect(results).toHaveLength(1);
    expect(results[0].jobId).toBe('job-remote');
  });

  it('limits results to 10', async () => {
    const jobs = Array.from({ length: 12 }).map((_, index) =>
      createJob({ id: `job-${index}`, title: `Engineer ${index}` }),
    );

    const { service } = createService({ jobs, assessments: [] });

    const results = await service.runSearchSet('set-1', 'user-1', 20);

    expect(results).toHaveLength(10);
  });

  it('caps results at 10 even when limit below 1 or above 10', async () => {
    const jobs = Array.from({ length: 20 }).map((_, index) =>
      createJob({ id: `job-${index}`, title: `Engineer ${index}` }),
    );

    const { service } = createService({ jobs, assessments: [] });

    const highLimit = await service.runSearchSet('set-1', 'user-1', 50);
    const lowLimit = await service.runSearchSet('set-1', 'user-1', 0);

    expect(highLimit).toHaveLength(10);
    expect(lowLimit).toHaveLength(1);
  });

  it('derives applyUrl from sourceUrl and falls back to null when invalid', async () => {
    const { service } = createService({
      jobs: [
        createJob({ id: 'job-valid', sourceUrl: 'https://example.com/apply' }),
        createJob({ id: 'job-invalid', sourceUrl: 'notaurl' }),
        createJob({ id: 'job-missing', sourceUrl: null }),
      ],
      assessments: [],
    });

    const results = await service.runSearchSet('set-1', 'user-1', 5);

    const byId = Object.fromEntries(results.map((r) => [r.jobId, r]));

    expect(byId['job-valid'].applyUrl).toBe('https://example.com/apply');
    expect(byId['job-invalid'].applyUrl).toBeNull();
    expect(byId['job-missing'].applyUrl).toBeNull();
    expect(byId['job-valid'].sourceUrl).toBe('https://example.com/apply');
  });

  it('prefers explicit apply/posting/job URLs and normalizes them', async () => {
    const jobs = [
      createJob({
        id: 'job-apply',
        // @ts-expect-error testing loose fields from persisted data
        applyUrl: ' https://jobs.example.com/submit ',
      }),
      createJob({
        id: 'job-posting',
        // @ts-expect-error testing loose fields from persisted data
        postingUrl: 'https://jobs.example.com/posting/123',
      }),
      createJob({
        id: 'job-joburl',
        // @ts-expect-error testing loose fields from persisted data
        jobUrl: 'http://jobs.example.com/job/999',
      }),
    ];

    const { service } = createService({ jobs, assessments: [] });

    const results = await service.runSearchSet('set-1', 'user-1', 5);

    expect(results.find((r) => r.jobId === 'job-apply')?.applyUrl).toBe(
      'https://jobs.example.com/submit',
    );
    expect(results.find((r) => r.jobId === 'job-posting')?.applyUrl).toBe(
      'https://jobs.example.com/posting/123',
    );
    expect(results.find((r) => r.jobId === 'job-joburl')?.applyUrl).toBe(
      'http://jobs.example.com/job/999',
    );
  });

  it('always includes applyUrl field even when null', async () => {
    const jobs = [
      createJob({ id: 'job-with', sourceUrl: 'https://example.com/has' }),
      createJob({ id: 'job-without', sourceUrl: null }),
    ];

    const { service } = createService({ jobs, assessments: [] });

    const results = await service.runSearchSet('set-1', 'user-1', 5);

    const byId = Object.fromEntries(results.map((r) => [r.jobId, r]));
    expect(byId['job-with']).toHaveProperty('applyUrl', 'https://example.com/has');
    expect(byId['job-without']).toHaveProperty('applyUrl', null);
  });

  it('returns empty results when search set is inactive', async () => {
    const { service } = createService({
      searchSet: { ...baseSearchSet, isActive: false },
    });

    const results = await service.runSearchSet('set-1', 'user-1');

    expect(results).toEqual([]);
  });
});
