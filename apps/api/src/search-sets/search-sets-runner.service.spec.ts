import { BadRequestException } from '@nestjs/common';
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
    seniority: [],
    industry: [],
    workMode: [],
    location: null,
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

  const createFitAssessment = (overrides: Partial<FitAssessment> = {}) =>
    ({
      id: overrides.id ?? 'assessment-1',
      userId: overrides.userId ?? 'user-1',
      jobId: overrides.jobId ?? 'job-1',
      baselineId: overrides.baselineId ?? 'baseline-1',
      baselineVersion: overrides.baselineVersion ?? 1,
      overallScore: overrides.overallScore ?? 90,
      verdict: overrides.verdict ?? FitAssessmentVerdict.APPLY,
      dimensionScores:
        overrides.dimensionScores ??
        ({
          experienceAlignment: 90,
          leadershipLevel: 90,
          technicalPlatformFit: 90,
          industryContext: 90,
          strategicTacticalFit: 90,
        } as FitAssessment['dimensionScores']),
      strengths: overrides.strengths ?? [],
      gaps: overrides.gaps ?? [],
      complianceFlags: overrides.complianceFlags ?? [],
      inputsHash: overrides.inputsHash ?? null,
      createdAt: overrides.createdAt ?? new Date(),
    } as FitAssessment);

  const createService = ({
    jobs = [createJob()],
    assessments = [] as FitAssessment[],
    baselineVersion = {
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
    },
  }: {
    jobs?: Job[];
    assessments?: FitAssessment[];
    baselineVersion?: {
      id: string;
      baselineId: string;
      versionNumber: number;
      verifiedAdditions?: string[];
      baseline: {
        id: string;
        userId: string;
        version: number;
        sections: any[];
      };
    };
  } = {}) => {
    const jobRepository = {
      find: jest.fn().mockResolvedValue(jobs),
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
      getSearchSetForUser: jest.fn().mockResolvedValue(baseSearchSet),
    } as unknown as jest.Mocked<SearchSetsService>;

    const service = new SearchSetsRunnerService(
      jobRepository as never,
      searchSetsService,
      fitAssessmentRepository as never,
      baselineRepository as never,
      baselineVersionRepository as never,
      baselineBlockPolicyRepository as never,
      fitScoringService as never,
    );

    return {
      service,
      jobRepository,
      fitAssessmentRepository,
      baselineRepository,
      baselineVersionRepository,
      baselineBlockPolicyRepository,
      fitScoringService,
      baselineVersion,
    };
  };

  it('requires a baselineVersionId', async () => {
    const { service, baselineVersion } = createService();

    await expect(
      service.runSearchSet('set-1', 'user-1', '   '),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.runSearchSet('set-1', 'user-1', ''),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('limits results to 10 entries even when more jobs exist', async () => {
    const jobs = Array.from({ length: 12 }).map((_, index) =>
      createJob({
        id: `job-${index}`,
        title: `Engineer ${index}`,
        createdAt: new Date(2024, 0, index + 1),
      }),
    );

    const { service, baselineVersion } = createService({ jobs });
    const results = await service.runSearchSet(
      'set-1',
      'user-1',
      baselineVersion.id,
    );

    expect(results).toHaveLength(10);
  });

  it('returns normalized applyUrl and keeps fallback sourceUrl', async () => {
    const jobs = [
      createJob({
        id: 'job-apply',
        // @ts-expect-error testing unstored fields
        applyUrl: ' https://jobs.example.com/submit ',
      }),
      createJob({
        id: 'job-posting',
        // @ts-expect-error testing unstored fields
        postingUrl: 'https://jobs.example.com/posting/123',
      }),
      createJob({
        id: 'job-source',
        sourceUrl: 'https://jobs.example.com/source',
      }),
    ];

    const { service, baselineVersion } = createService({ jobs });

    const results = await service.runSearchSet(
      'set-1',
      'user-1',
      baselineVersion.id,
    );

    const map = Object.fromEntries(results.map((result) => [result.jobId, result]));

    expect(map['job-apply'].applyUrl).toBe('https://jobs.example.com/submit');
    expect(map['job-posting'].applyUrl).toBe(
      'https://jobs.example.com/posting/123',
    );
    expect(map['job-source'].applyUrl).toBe('https://jobs.example.com/source');
  });
});
