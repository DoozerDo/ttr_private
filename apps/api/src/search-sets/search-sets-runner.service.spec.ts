import { BadRequestException } from '@nestjs/common';
import { FitAssessment, FitAssessmentVerdict } from '../analysis/fit-assessment.entity';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { JobsService } from '../jobs/jobs.service';
import { JobSourceListing, JobDetailRaw } from '../job-sources/job-source.types';
import { JobSourceRegistry } from '../job-sources/job-source-registry.service';
import {
  SearchSet,
  SearchSetSourceType,
  SearchSetSeniority,
  SearchSetWorkMode,
} from './search-set.entity';
import { SearchSetRunsService } from './search-set-runs.service';
import { SearchSetsRunnerService } from './search-sets-runner.service';
import { SearchSetsService } from './search-sets.service';

describe('SearchSetsRunnerService', () => {
  const baseSearchSet: SearchSet = {
    id: 'set-1',
    userId: 'user-1',
    titlePatterns: ['Engineer'],
    seniority: [],
    industry: [],
    workMode: [],
    location: null,
    sourceUrl: null,
    sourceType: null,
    sourceOptions: null,
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

  const baselineVersion = {
    id: 'baseline-version-1',
    baselineId: 'baseline-1',
    versionNumber: 1,
    verifiedAdditions: [],
    baseline: {
      id: 'baseline-1',
      userId: 'user-1',
      version: 1,
      sections: [],
    } as any,
  };

  const createService = ({
    jobs = [createJob()],
    assessments = [] as FitAssessment[],
    searchSetOverrides = {},
    provider: jobSourceProvider = null,
    jobRepositoryFindOne = jest.fn().mockResolvedValue(null),
  }: {
    jobs?: Job[];
    assessments?: FitAssessment[];
    searchSetOverrides?: Partial<SearchSet>;
    provider?: {
      id: string;
      fetchListings: jest.Mock<any, any>;
      fetchJobDetail: jest.Mock<any, any>;
      parseJob: jest.Mock<any, any>;
    } | null;
    jobRepositoryFindOne?: jest.Mock<any, any>;
  } = {}) => {
    const jobRepository = {
      find: jest.fn().mockResolvedValue(jobs),
      findOne: jobRepositoryFindOne,
    };

    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(assessments),
    };

    const fitAssessmentRepository = {
      createQueryBuilder: jest.fn(() => qb),
    };

    const baselineRepository = {
      findOne: jest.fn().mockResolvedValue(baselineVersion.baseline),
    };

    const baselineVersionRepository = {
      findOne: jest.fn().mockResolvedValue(baselineVersion),
    };

    const baselineBlockPolicyRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    const fitScoringService = {
      score: jest.fn().mockReturnValue({
        overallScore: 70,
        verdict: FitAssessmentVerdict.CONSIDER,
        dimensionScores: {
          experienceAlignment: 70,
          leadershipLevel: 70,
          technicalPlatformFit: 70,
          industryContext: 70,
          strategicTacticalFit: 70,
        },
      }),
    };

    const searchSetsService = {
      getSearchSetForUser: jest
        .fn()
        .mockResolvedValue({ ...baseSearchSet, ...searchSetOverrides }),
      recordRunMetadata: jest.fn(),
    } as unknown as jest.Mocked<SearchSetsService>;

    const jobsService: Partial<JobsService> = {
      createJob: jest.fn(async (userId, payload) =>
        createJob({
          id: `job-${Math.random().toString(36).slice(2)}`,
          userId,
          title: payload.title ?? 'Provider role',
          company: payload.company ?? null,
          rawDescription: payload.rawDescription,
          sourceUrl: payload.sourceUrl ?? null,
          normalizedResponsibilities: payload.responsibilities ?? [],
          normalizedRequirements: payload.requirements ?? [],
        }),
      ),
    };

    const jobSourceRegistry = {
      findProvider: jest.fn().mockReturnValue(jobSourceProvider),
    } as unknown as jest.Mocked<JobSourceRegistry>;

    const searchSetRunsService = {
      recordRun: jest.fn(),
    } as unknown as jest.Mocked<SearchSetRunsService>;

    const service = new SearchSetsRunnerService(
      jobRepository as never,
      jobsService as never,
      searchSetsService,
      jobSourceRegistry,
      fitAssessmentRepository as never,
      baselineRepository as never,
      baselineVersionRepository as never,
      baselineBlockPolicyRepository as never,
      fitScoringService as never,
      searchSetRunsService as never,
    );

    return {
      service,
      jobRepository,
      jobsService,
      searchSetsService,
      jobSourceRegistry,
      searchSetRunsService,
      baselineVersion,
      fitScoringService,
      fitAssessmentRepository,
      baselineBlockPolicyRepository,
    };
  };

  it('requires a baselineVersionId', async () => {
    const { service } = createService();

    await expect(
      service.runSearchSet('set-1', 'user-1', '   '),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.runSearchSet('set-1', 'user-1', ''),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('limits legacy results to 10 entries even when more jobs exist', async () => {
    const jobs = Array.from({ length: 12 }).map((_, index) =>
      createJob({
        id: `job-${index}`,
        title: `Engineer ${index}`,
        createdAt: new Date(2024, 0, index + 1),
      }),
    );
    const { service, baselineVersion } = createService({ jobs });

    const response = await service.runSearchSet(
      'set-1',
      'user-1',
      baselineVersion.id,
    );

    expect(response.results).toHaveLength(10);
  });

  it('returns normalized applyUrl and fallback sourceUrl', async () => {
    const jobs = [
      createJob({
        id: 'job-apply',
        company: 'Acme',
        // @ts-expect-error testing stub fields
        applyUrl: ' https://jobs.example.com/submit ',
      }),
      createJob({
        id: 'job-posting',
        company: 'Acme',
        // @ts-expect-error testing stub fields
        postingUrl: 'https://jobs.example.com/posting/123',
      }),
      createJob({
        id: 'job-source',
        company: 'Acme',
        sourceUrl: 'https://jobs.example.com/source',
      }),
    ];

    const { service, baselineVersion } = createService({ jobs });

    const response = await service.runSearchSet(
      'set-1',
      'user-1',
      baselineVersion.id,
    );

    const map = Object.fromEntries(
      response.results.map((result) => [result.jobId, result]),
    );

    expect(map['job-apply']?.applyUrl).toBe('https://jobs.example.com/submit');
    expect(map['job-posting']?.applyUrl).toBe(
      'https://jobs.example.com/posting/123',
    );
    expect(map['job-source']?.applyUrl).toBe('https://jobs.example.com/source');
  });

  it('selects a provider when the search set source is configured', async () => {
    const provider = {
      id: 'greenhouse',
      fetchListings: jest.fn().mockResolvedValue([
        {
          externalId: 'gh-1',
          title: 'Engineer',
          location: 'Remote',
          url: 'https://boards.greenhouse.io/company/jobs/gh-1',
          postedAt: null,
        },
      ] as JobSourceListing[]),
      fetchJobDetail: jest.fn().mockResolvedValue({
        url: 'https://boards.greenhouse.io/company/jobs/gh-1',
        html: '<div>Job content</div>',
        fetchedAt: new Date(),
        metadata: {
          title: 'Engineer',
          company: 'Acme',
          location: { name: 'Remote' },
          apply_url: 'https://apply.example.com/gh-1',
          id: 'gh-1',
        },
      } as JobDetailRaw),
      parseJob: jest.fn().mockImplementation((detail: JobDetailRaw) => ({
        title: 'Engineer',
        company: 'Acme',
        location: 'Remote',
        descriptionText: 'Desc text',
        responsibilities: [],
        requirements: [],
        applyUrl: 'https://apply.example.com/gh-1',
        sourceUrl: detail.url,
        externalId: 'gh-1',
      })),
    };

    const { service, jobSourceRegistry, searchSetsService, baselineVersion } =
      createService({
        provider,
        searchSetOverrides: {
          sourceType: SearchSetSourceType.GREENHOUSE,
          sourceUrl: 'https://boards.greenhouse.io/company',
        },
      });

    await service.runSearchSet('set-1', 'user-1', baselineVersion.id);

    expect(jobSourceRegistry.findProvider).toHaveBeenCalled();
    expect(provider.fetchListings).toHaveBeenCalled();
    expect(searchSetsService.getSearchSetForUser).toHaveBeenCalled();
  });

  it('deduplicates provider jobs when a matching externalId already exists', async () => {
    const job = createJob({
      id: 'existing-job',
      sourceExternalId: 'gh-1',
      sourceProviderId: 'greenhouse',
      jdIngestionMethod: JobIngestionMethod.SOURCE_PROVIDER,
    });

    const provider = {
      id: 'greenhouse',
      fetchListings: jest.fn().mockResolvedValue([
        {
          externalId: 'gh-1',
          title: 'Engineer',
          location: 'Remote',
          url: 'https://boards.greenhouse.io/company/jobs/gh-1',
          postedAt: null,
        },
      ] as JobSourceListing[]),
      fetchJobDetail: jest.fn().mockResolvedValue({
        url: 'https://boards.greenhouse.io/company/jobs/gh-1',
        html: '<div>Job content</div>',
        fetchedAt: new Date(),
        metadata: { title: 'Engineer', company: 'Acme', id: 'gh-1' },
      } as JobDetailRaw),
      parseJob: jest.fn().mockImplementation((detail: JobDetailRaw) => ({
        title: 'Engineer',
        company: 'Acme',
        location: 'Remote',
        descriptionText: 'Desc text',
        responsibilities: [],
        requirements: [],
        applyUrl: detail.url,
        sourceUrl: detail.url,
        externalId: 'gh-1',
      })),
    };

    const jobRepositoryFindOne = jest.fn().mockImplementation(({ where }) => {
      if (where?.sourceExternalId === 'gh-1') {
        return Promise.resolve(job);
      }
      return Promise.resolve(null);
    });

    const { service, jobsService, baselineVersion } = createService({
      provider,
      searchSetOverrides: {
        sourceType: SearchSetSourceType.GREENHOUSE,
        sourceUrl: 'https://boards.greenhouse.io/company',
      },
      jobRepositoryFindOne,
    });

    await service.runSearchSet('set-1', 'user-1', baselineVersion.id);

    expect(jobsService.createJob).not.toHaveBeenCalled();
  });

  it('returns top 10 provider results and metadata', async () => {
    const listings = Array.from({ length: 15 }).map((_, index) => ({
      externalId: `gh-${index}`,
      title: `Engineer Role ${index}`,
      location: 'Remote',
      url: `https://boards.greenhouse.io/company/jobs/gh-${index}`,
      postedAt: null,
    }));

    const provider = {
      id: 'greenhouse',
      fetchListings: jest.fn().mockResolvedValue(listings),
      fetchJobDetail: jest.fn().mockImplementation((listing: JobSourceListing) =>
        Promise.resolve({
          url: listing.url,
          html: `<div>${listing.title}</div>`,
          fetchedAt: new Date(),
          metadata: {
            title: listing.title,
            company: 'Acme',
            id: listing.externalId,
            apply_url: `https://apply.example.com/${listing.externalId}`,
          },
        }),
      ),
      parseJob: jest.fn().mockImplementation((detail: JobDetailRaw) => ({
        title: detail.metadata?.title ?? 'Role',
        company: 'Acme',
        location: 'Remote',
        descriptionText: 'Description'.repeat(200),
        responsibilities: [],
        requirements: [],
        applyUrl: detail.metadata?.apply_url ?? detail.url,
        sourceUrl: detail.url,
        externalId: detail.metadata?.id ?? 'gh',
      })),
    };

    const { service, baselineVersion, jobSourceRegistry } = createService({
      provider,
      searchSetOverrides: {
        sourceType: SearchSetSourceType.GREENHOUSE,
        sourceUrl: 'https://boards.greenhouse.io/company',
      },
    });

    const response = await service.runSearchSet(
      'set-1',
      'user-1',
      baselineVersion.id,
    );

    expect(response.results).toHaveLength(10);
    expect(response.metadata.usedProviderDiscovery).toBe(true);
    expect(response.metadata.providerId).toBe('greenhouse');
    expect(jobSourceRegistry.findProvider).toHaveBeenCalled();
    expect(response.metadata.fetchedListingCount).toBe(listings.length);
    expect(response.metadata.ingestedNewCount).toBe(listings.length);
    expect(response.metadata.dedupedCount).toBe(0);
  });

  it('records failures without stopping successful listings', async () => {
    const listings = [
      {
        externalId: 'gh-1',
        title: 'Engineer Role A',
        location: 'Remote',
        url: 'https://boards.greenhouse.io/company/jobs/gh-1',
        postedAt: null,
      },
      {
        externalId: 'gh-2',
        title: 'Engineer Role B',
        location: 'Remote',
        url: 'https://boards.greenhouse.io/company/jobs/gh-2',
        postedAt: null,
      },
    ];

    const provider = {
      id: 'greenhouse',
      fetchListings: jest.fn().mockResolvedValue(listings),
      fetchJobDetail: jest.fn().mockImplementation((listing: JobSourceListing) => {
        if (listing.externalId === 'gh-2') {
          throw new Error('Timeout');
        }
        return Promise.resolve({
          url: listing.url,
          html: `<div>${listing.title}</div>`,
          fetchedAt: new Date(),
          metadata: {
            title: listing.title,
            company: 'Acme',
            id: listing.externalId,
          },
        } as JobDetailRaw);
      }),
      parseJob: jest.fn().mockImplementation((detail: JobDetailRaw) => ({
        title: detail.metadata?.title ?? 'Role',
        company: 'Acme',
        location: 'Remote',
        descriptionText: 'Description text',
        responsibilities: [],
        requirements: [],
        applyUrl: detail.metadata?.apply_url ?? detail.url,
        sourceUrl: detail.url,
        externalId: detail.metadata?.id ?? 'gh',
      })),
    };

    const { service, baselineVersion, searchSetRunsService } = createService({
      provider,
      searchSetOverrides: {
        sourceType: SearchSetSourceType.GREENHOUSE,
        sourceUrl: 'https://boards.greenhouse.io/company',
      },
    });

    const response = await service.runSearchSet(
      'set-1',
      'user-1',
      baselineVersion.id,
    );

    expect(response.results).toHaveLength(1);
    expect(response.metadata.failureCount).toBe(1);
    expect(provider.parseJob).toHaveBeenCalledTimes(1);
    expect(response.metadata.fetchedListingCount).toBe(listings.length);
    expect(response.metadata.ingestedNewCount).toBe(1);
    expect(response.metadata.dedupedCount).toBe(0);

    const recorded = searchSetRunsService.recordRun.mock.calls[0][0];
    expect(recorded.failureCount).toBe(1);
  });
});
