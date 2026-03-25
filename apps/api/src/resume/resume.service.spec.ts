import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ResumeService, GenerateResumeRequest } from './resume.service';
import { Baseline, BaselineStatus } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineIncludePolicy, BaselineSection, BaselineSectionType } from '../baseline/baseline-section.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceAction, ComplianceFlagSeverity } from '../compliance/compliance.types';
import { ApplicationsService } from '../applications/applications.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { CriticalFlowTrackerService } from '../support/critical-flow-tracker.service';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>> & {
  findOne: jest.Mock;
  find: jest.Mock;
};

const buildRepo = <T>(findOneValue: unknown): MockRepo<T> => ({
  findOne: jest.fn().mockResolvedValue(findOneValue),
  find: jest.fn().mockResolvedValue([]),
});

const baseSection: BaselineSection = {
  id: 'section-1',
  baselineId: 'baseline-1',
  sectionType: BaselineSectionType.EXPERIENCE,
  title: 'Experience',
  content:
    `Senior Program Manager at Example Co from 2020 to 2024. Led support operations and improved service reliability across global teams. Built playbooks, reduced incident volume, and managed executive stakeholder updates. `.repeat(
      25,
    ),
  includePolicy: BaselineIncludePolicy.ALWAYS,
  order: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseline: Baseline = {
  id: 'baseline-1',
  userId: 'user-1',
  version: 1,
  originalFilename: 'resume.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  storagePath: '/tmp/resume.docx',
  hash: null,
  status: BaselineStatus.ACTIVE,
  archivedAt: null,
  sections: [baseSection],
  parsedRecords: [],
  versions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baselineVersion: BaselineVersion = {
  id: 'baseline-version-1',
  baseline,
  baselineId: baseline.id,
  versionNumber: 1,
  fileHash: 'hash-1',
  hash: 'hash-1',
  allowedCompanies: [],
  allowedRoles: [],
  allowedTechnologies: [],
  allowedMetricTokens: [],
  verifiedAdditions: [],
  additionDiff: null,
  promotedFromInterviewId: null,
  blockPolicies: [],
  storagePath: '/tmp/version-1',
  createdAt: new Date(),
};

const job: Job = {
  id: 'job-1',
  userId: 'user-1',
  title: 'Program Manager',
  company: 'Example Co',
  rawDescription: 'Program Manager role with measurable support outcomes.',
  sourceUrl: null,
  sourceProviderId: null,
  sourceExternalId: null,
  canonicalUrl: null,
  dedupeHash: null,
  normalizedResponsibilities: ['Lead support operations'],
  normalizedRequirements: ['Drive measurable outcomes'],
  jdIngestionMethod: JobIngestionMethod.PASTE,
  jdParsedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
  isArchived: false,
};

const assessment: FitAssessment = {
  id: 'analysis-1',
  userId: 'user-1',
  jobId: job.id,
  baselineId: baseline.id,
  baselineVersion: baselineVersion.versionNumber,
  overallScore: 90,
  verdict: 'APPLY' as any,
  dimensionScores: {
    experienceAlignment: 85,
    leadershipLevel: 88,
    technicalPlatformFit: 80,
    industryContext: 78,
    strategicTacticalFit: 82,
  },
  strengths: [],
  gaps: [],
  complianceFlags: [],
  scoringV2: null,
  inputsHash: null,
  isSynthetic: false,
  syntheticScenarioKey: null,
  syntheticRunId: null,
  syntheticCreatedAt: null,
  preserveFromCleanup: false,
  createdAt: new Date(),
};

const baseRequest: GenerateResumeRequest = {
  baselineId: baseline.id,
  baselineVersionId: baselineVersion.id,
  jobId: job.id,
  analysisId: assessment.id,
  oneTap: false,
};

const buildService = (options?: {
  complianceFlags?: Array<{ code: string; message: string; severity: string }>;
  blocked?: boolean;
}) => {
  const baselineRepo = buildRepo<Baseline>(baseline);
  const versionRepo = buildRepo<BaselineVersion>(baselineVersion);
  const policyRepo = buildRepo<BaselineBlockPolicy>([]);
  policyRepo.find = jest.fn().mockResolvedValue([]);
  const jobRepo = buildRepo<Job>(job);
  const assessmentRepo = buildRepo<FitAssessment>(assessment);

  const complianceService = {
    normalizeSectionsForOutput: jest.fn().mockImplementation((sections) => sections),
    enforceResumeWritingRules: jest.fn().mockReturnValue([]),
    detectScopeInflation: jest.fn().mockResolvedValue([]),
    validateAndAudit: jest.fn().mockResolvedValue({
      complianceFlags: options?.complianceFlags ?? [],
      blocked: options?.blocked ?? false,
      audit: {
        id: 'audit-1',
        baselineVersionId: baselineVersion.id,
        baselineVersionHash: baselineVersion.hash,
        outputHash: 'hash-output',
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-1',
        jobId: job.id,
        createdAt: new Date().toISOString(),
      },
    }),
  } as unknown as jest.Mocked<ComplianceService>;

  const applicationsService = {
    upsertPreparedFromResumeGeneration: jest.fn().mockResolvedValue({ id: 'tracker-1', status: 'Prepared' }),
  } as unknown as jest.Mocked<ApplicationsService>;

  const opportunitiesService = {
    createFromResumeStudio: jest.fn().mockResolvedValue({ id: 'opp-1' }),
  } as unknown as jest.Mocked<OpportunitiesService>;

  const gapAnalysisService = {
    analyze: jest.fn().mockReturnValue(null),
  } as unknown as GapAnalysisService;

  const criticalFlowTrackerService = {
    recordCriticalFlowEvent: jest.fn().mockResolvedValue(undefined),
  } as unknown as CriticalFlowTrackerService;

  const service = new ResumeService(
    baselineRepo as Repository<Baseline>,
    versionRepo as Repository<BaselineVersion>,
    policyRepo as Repository<BaselineBlockPolicy>,
    jobRepo as Repository<Job>,
    assessmentRepo as Repository<FitAssessment>,
    complianceService,
    applicationsService,
    opportunitiesService,
    gapAnalysisService,
    criticalFlowTrackerService,
  );

  return { service, complianceService, applicationsService, opportunitiesService };
};

describe('ResumeService contract', () => {
  it('throws BadRequest when baselineVersionId is missing', async () => {
    const { service } = buildService();
    await expect(
      service.generateResume('user-1', { ...baseRequest, baselineVersionId: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns readiness ready and allows generation in READY state', async () => {
    const { service } = buildService();
    const readiness = await service.getGenerationReadiness('user-1', baseRequest);
    expect(readiness.status).toBe('ready');

    await expect(service.generateResume('user-1', baseRequest)).rejects.toMatchObject({
      response: {
        code: 'generation_failed',
      },
      status: 422,
    });
  });

  it('returns readiness limited but blocks generation with generation_blocked', async () => {
    const { service } = buildService({
      complianceFlags: [
        {
          code: 'personalization_limitation',
          message: 'Generation is limited by verification constraints.',
          severity: ComplianceFlagSeverity.WARN,
        },
      ],
      blocked: false,
    });

    const readiness = await service.getGenerationReadiness('user-1', baseRequest);
    expect(readiness.status).toBe('limited');

    await expect(service.generateResume('user-1', baseRequest)).rejects.toMatchObject({
      response: {
        code: 'generation_blocked',
        message:
          'Generation is not available for this role due to insufficient verified evidence.',
      },
      status: 422,
    });
  });

  it('throws generation_blocked when readiness is BLOCKED', async () => {
    const { service, applicationsService, opportunitiesService } = buildService({
      complianceFlags: [
        {
          code: 'full_block',
          message: 'Missing verified evidence for core responsibilities.',
          severity: ComplianceFlagSeverity.BLOCK,
        },
      ],
      blocked: true,
    });

    await expect(service.generateResume('user-1', baseRequest)).rejects.toMatchObject({
      response: {
        code: 'generation_blocked',
        blockers: [
          {
            code: 'full_block',
            message: 'Missing verified evidence for core responsibilities.',
          },
        ],
      },
      status: 422,
    });

    expect(applicationsService.upsertPreparedFromResumeGeneration).not.toHaveBeenCalled();
    expect(opportunitiesService.createFromResumeStudio).not.toHaveBeenCalled();
  });
});
