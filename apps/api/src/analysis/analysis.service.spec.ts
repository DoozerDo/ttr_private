import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineParsed } from '../baseline/baseline-parsed.entity';
import { BaselineSchemaCoreShape } from '../baseline/baseline-schema';
import {
  ComplianceAction,
  ComplianceFlagSeverity,
} from '../compliance/compliance.types';
import { ComplianceService } from '../compliance/compliance.service';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { User } from '../users/user.entity';
import { Interview } from '../interviews/interview.entity';
import { ExpandedFitAssessment } from './expanded-fit-assessment.entity';
import { AnalysisService } from './analysis.service';
import { FitAssessment, FitAssessmentVerdict } from './fit-assessment.entity';
import { FitScoringService } from './fit-scoring.service';
import { GapAnalysisService } from './gap-analysis.service';
import { WorkflowIdempotencyService } from '../common/workflow-idempotency.service';
import type { CalibrationProfile } from './calibration-profiles';
import type { RunFitAssessmentDto } from './dto/run-fit-assessment.dto';
import type { CxFitV2Result } from './cx-fit-scoring-v2';

describe('AnalysisService - fit scores contract', () => {
  let service: AnalysisService;
  let complianceService: ComplianceService;
  let baselineVersionRepository: { findOne: jest.Mock };
  let baselineRepository: { findOne: jest.Mock; update: jest.Mock };
  let usersRepository: { findOne: jest.Mock; update: jest.Mock; save: jest.Mock };
  let fitAssessmentRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let jobRepository: { findOne: jest.Mock };
  let fitScoringServiceMock: { score: jest.Mock };

  const baselineVersion: Partial<BaselineVersion> = {
    id: 'bv-1',
    baselineId: 'b-1',
    versionNumber: 2,
    baseline: { id: 'b-1', userId: 'user-1' } as Baseline,
  };

  const baselineSections: BaselineSection[] = [
    {
      id: 's-1',
      baselineId: 'b-1',
      sectionType: 'EXPERIENCE' as any,
      title: null,
      content:
        'Implemented distributed systems and led platform teams across reliability, cloud platform, and developer productivity initiatives. ' +
        'Partnered with product, engineering, and support leaders to scale operational processes and improve incident response. '.repeat(2),
      includePolicy: BaselineIncludePolicy.OPTIONAL,
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BaselineSection,
    {
      id: 's-2',
      baselineId: 'b-1',
      sectionType: 'SKILLS' as any,
      title: null,
      content:
        'AWS, Kubernetes, Terraform, distributed systems, incident management, observability, platform strategy, reliability engineering. ' +
        'Cloud migration, operating model design, team leadership, and stakeholder alignment. '.repeat(2),
      includePolicy: BaselineIncludePolicy.OPTIONAL,
      order: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BaselineSection,
  ];

  const baseline: Baseline = {
    id: 'b-1',
    userId: 'user-1',
    version: 2,
    originalFilename: 'resume.pdf',
    mimeType: 'application/pdf',
    storagePath: '/tmp/resume.pdf',
    hash: 'hash',
    sections: baselineSections,
    versions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  /**
   * IMPORTANT:
   * AnalysisService now enforces "exactly one of raw JD text or parsed_jd".
   * For Job records that include rawDescription, tests must not also supply
   * normalized segments that the service would treat as parsed_jd.
   */
  const defaultJobRecord: Partial<Job> = {
    id: 'job-1',
    userId: 'user-1',
    rawDescription: 'Lead operations with AWS focus.',
    normalizedResponsibilities: [],
    normalizedRequirements: [],
    jdIngestionMethod: JobIngestionMethod.PASTE,
    title: 'Cloud Lead',
    company: 'ExampleCo',
    sourceUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

const sampleScoringV2: CxFitV2Result = {
  score: 80,
  rubric: {
    id: 'scoring_contract_v1',
    weights: {
      role_scope_and_seniority: 25,
      support_operations_and_process_rigor: 25,
      tooling_and_platform_experience: 20,
      domain_and_business_context: 15,
      change_leadership_and_customer_advocacy: 15,
    },
    dimensionPercents: {
      role_scope_and_seniority: 80,
      support_operations_and_process_rigor: 70,
      tooling_and_platform_experience: 60,
      domain_and_business_context: 75,
      change_leadership_and_customer_advocacy: 65,
    },
    dimensionPoints: {
      role_scope_and_seniority: 20,
      support_operations_and_process_rigor: 18,
      tooling_and_platform_experience: 12,
      domain_and_business_context: 11,
      change_leadership_and_customer_advocacy: 9,
    },
    subtotal: 70,
    penalties: [],
    finalBeforeClamp: 70,
    rounding: 'round_half_up_final_only',
  },
  debug: {
    jobScoringTextSource: 'raw',
    baselineBand: 'L4',
    roleBand: 'L4',
    bandDelta: 0,
    domainTagsBaseline: [],
    domainTagsRole: [],
    responsibilityOverlapPercent: 0,
    baselineCoveragePercent: 0,
    toolingCoverage: {
      requiredCoverage: 0,
      preferredCoverage: 0,
    },
  },
};

  beforeEach(async () => {
    baselineVersionRepository = {
      findOne: jest.fn().mockResolvedValue(baselineVersion),
    };
    baselineRepository = {
      findOne: jest.fn().mockResolvedValue(baseline),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    usersRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        calibrationProfileName: null,
        calibrationWeights: null,
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn().mockResolvedValue({
        id: 'user-1',
        calibrationProfileName: null,
        calibrationWeights: null,
      }),
    };
    jobRepository = { findOne: jest.fn().mockResolvedValue(defaultJobRecord) };
    fitScoringServiceMock = {
      buildComplianceFlags: jest.fn().mockReturnValue([]),
      score: jest.fn().mockResolvedValue({
        overallScore: 82,
        rawScore: 82,
        verdict: 'Apply',
        persistenceVerdict: FitAssessmentVerdict.APPLY,
        dimensionScores: {
          experienceAlignment: 80,
          leadershipLevel: 85,
          technicalPlatformFit: 70,
          industryContext: 75,
          strategicTacticalFit: 65,
        },
        strengths: [],
        gaps: [],
        summary: 'summary',
        missingRequiredTools: [],
        missingRequiredToolsCount: 0,
        missingRequiredToolsPenalty: 0,
        leadershipOverrideApplied: false,
        complianceFlags: [],
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        AnalysisService,
        {
          provide: FitScoringService,
          useValue: fitScoringServiceMock,
        },
        {
          provide: ComplianceService,
          useValue: {
            validateAndAudit: jest.fn().mockResolvedValue({
              complianceFlags: [],
              blocked: false,
              audit: {
                id: 'audit-1',
                outputHash: '',
                baselineVersionHash: 'hash',
                baselineVersionId: 'bv-1',
                action: ComplianceAction.FIT_SCORE,
                actorId: 'user-1',
                jobId: null,
                createdAt: new Date().toISOString(),
              },
            }),
            normalizeSectionsForOutput: jest
              .fn()
              .mockImplementation((sections) => sections),
            normalizeText: jest.fn().mockImplementation((text) => String(text)),
          },
        },
        {
          provide: GapAnalysisService,
          useValue: {
            analyze: jest.fn().mockReturnValue({
              strengths: [],
              criticalGaps: [],
              recommendedActions: [],
              positioningSuggestions: [],
              interviewRisks: [],
            }),
            validateRequirements: jest.fn().mockImplementation((requirements) => requirements),
          },
        },
        {
          provide: WorkflowIdempotencyService,
          useValue: {
            reserve: jest.fn().mockResolvedValue({
              status: 'accepted_new',
              runId: 'run-1',
              responseBody: null,
            }),
            complete: jest.fn().mockResolvedValue({ status: 'completed' }),
            markFailure: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(Baseline),
          useValue: baselineRepository,
        },
        {
          provide: getRepositoryToken(BaselineSection),
          useValue: {
            find: jest.fn().mockResolvedValue(baselineSections),
            createQueryBuilder: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getRawOne: jest.fn().mockResolvedValue({
                sectionCount: '2',
                totalChars: '1500',
              }),
            }),
          },
        },
        {
          provide: getRepositoryToken(BaselineBlockPolicy),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(BaselineVersion),
          useValue: baselineVersionRepository,
        },
        { provide: getRepositoryToken(Job), useValue: jobRepository },
        {
          provide: getRepositoryToken(Interview),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(FitAssessment),
          useValue: (() => {
            fitAssessmentRepository = {
              create: jest.fn((payload) => payload),
              save: jest.fn(async (payload) => ({
                ...payload,
                id: 'fit-1',
                createdAt: new Date(),
              })),
              findOne: jest.fn(),
            };

            return fitAssessmentRepository;
          })(),
        },
        {
          provide: getRepositoryToken(ExpandedFitAssessment),
          useValue: {
            create: jest.fn((payload) => payload),
            save: jest.fn(async (payload) => ({
              ...payload,
              id: 'exp-1',
              createdAt: new Date(),
            })),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: usersRepository,
        },
      ],
    }).compile();

    service = module.get(AnalysisService);
    complianceService = module.get(ComplianceService);
  });

  it('returns the baseline version id for the latest assessment', async () => {
    const expectedHash = await service['computeExpectedInputsHashForJobBaseline'](
      'user-1',
      defaultJobRecord as Job,
      baseline,
      baseline.version ?? null,
    );

    fitAssessmentRepository.findOne.mockResolvedValue({
      id: 'fit-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'b-1',
      baselineVersion: 2,
      overallScore: 82,
      inputsHash: expectedHash,
      verdict: 'APPLY',
      dimensionScores: {
        experienceAlignment: 10,
        leadershipLevel: 9,
        technicalPlatformFit: 8,
        industryContext: 7,
        strategicTacticalFit: 6,
      },
      strengths: ['aws'],
      gaps: ['golang'],
      complianceFlags: [],
      createdAt: new Date(),
    });

    const result = await service.getLatestAssessment('user-1', 'job-1');

    expect(result.baselineVersionId).toBe('bv-1');
    expect(baselineVersionRepository.findOne).toHaveBeenCalledWith({
      where: { baselineId: 'b-1', versionNumber: 2 },
      order: { createdAt: 'DESC' },
    });
  });

  it('includes scoring_v2 from the stored assessment payload', async () => {
    fitAssessmentRepository.findOne.mockResolvedValue({
      id: 'fit-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'b-1',
      baselineVersion: 2,
      overallScore: 82,
      verdict: 'APPLY',
      dimensionScores: {
        experienceAlignment: 10,
        leadershipLevel: 9,
        technicalPlatformFit: 8,
        industryContext: 7,
        strategicTacticalFit: 6,
      },
      strengths: ['aws'],
      gaps: ['golang'],
      complianceFlags: [],
      scoringV2: {
        ...sampleScoringV2,
        score: 68,
      },
      createdAt: new Date(),
    });

    const result = await service.getFitAssessmentById('user-1', 'fit-1');

    expect(result.fit_score).toBeLessThan(75);
    expect(result.fit_score).toBe(68);
    expect(result.overall_score).toBe(68);
    expect(result.score).toBe(68);
    expect(result.scoring_v2).toEqual(
      expect.objectContaining({
        score: 68,
        rubric: sampleScoringV2.rubric,
      }),
    );
    expect(result.scoring_v2?.debug?.toolingCoverage).toEqual(
      expect.objectContaining({
        requiredCoverage: expect.any(Number),
        preferredCoverage: expect.any(Number),
      }),
    );
  });

  it('refreshes tooling claims for Studio payload so verified Salesforce is not returned as unresolved', async () => {
    const salesforceSections: BaselineSection[] = [
      {
        id: 's-exp',
        baselineId: 'b-1',
        sectionType: 'EXPERIENCE' as any,
        title: 'Experience',
        content: 'Owned escalation and workflow administration in Salesforce Service Cloud.',
        includePolicy: BaselineIncludePolicy.OPTIONAL,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as BaselineSection,
    ];
    const salesforceJob: Partial<Job> = {
      ...defaultJobRecord,
      rawDescription: 'Must have Salesforce experience for support operations.',
      normalizedResponsibilities: [],
      normalizedRequirements: [],
    };

    jobRepository.findOne.mockResolvedValue(salesforceJob);
    const baselineRepo = service['baselineRepository'] as { findOne: jest.Mock };
    baselineRepo.findOne.mockResolvedValue({
      ...baseline,
      sections: salesforceSections,
      parsedRecords: [],
    });
    const baselineSectionRepo = service['baselineSectionRepository'] as {
      find: jest.Mock;
    };
    baselineSectionRepo.find.mockResolvedValue(salesforceSections);

    fitAssessmentRepository.findOne.mockResolvedValue({
      id: 'fit-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'b-1',
      baselineVersion: 2,
      overallScore: 82,
      verdict: 'APPLY',
      dimensionScores: {
        experienceAlignment: 10,
        leadershipLevel: 9,
        technicalPlatformFit: 8,
        industryContext: 7,
        strategicTacticalFit: 6,
      },
      strengths: ['aws'],
      gaps: ['golang'],
      complianceFlags: [],
      scoringV2: sampleScoringV2,
      createdAt: new Date(),
    });

    const result = await service.getFitAssessmentById('user-1', 'fit-1');
    const claims = result.scoring_v2?.debug?.toolingCoverage?.claims ?? [];
    const salesforceClaim = claims.find((claim) => claim.key === 'salesforce');

    expect(salesforceClaim?.status).toBe('VERIFIED');
    const unresolved = claims.filter((claim) => claim.status !== 'VERIFIED').map((claim) => claim.key);
    expect(unresolved).not.toContain('salesforce');
    const verifiedCount = claims.filter((claim) => claim.status === 'VERIFIED').length;
    expect(verifiedCount).toBeGreaterThan(0);
    expect(result.verification_coverage).toEqual(
      expect.objectContaining({
        totalClaims: expect.any(Number),
        verifiedClaims: expect.any(Number),
        inferredClaims: expect.any(Number),
        unverifiedClaims: expect.any(Number),
      }),
    );
  });

  it('maps equivalent canonical claim statuses to inferred in analysis verification coverage', async () => {
    fitAssessmentRepository.findOne.mockResolvedValue({
      id: 'fit-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'b-1',
      baselineVersion: 2,
      overallScore: 82,
      verdict: 'APPLY',
      dimensionScores: {
        experienceAlignment: 10,
        leadershipLevel: 9,
        technicalPlatformFit: 8,
        industryContext: 7,
        strategicTacticalFit: 6,
      },
      strengths: ['aws'],
      gaps: ['golang'],
      complianceFlags: [],
      scoringV2: {
        ...sampleScoringV2,
        debug: {
          ...(sampleScoringV2.debug ?? {}),
          toolingCoverage: {
            requiredCoverage: 0.5,
            preferredCoverage: 0.5,
            claims: [
              {
                key: 'salesforce',
                label: 'Salesforce',
                status: 'EQUIVALENT',
                generationBlocking: false,
                evidenceRefs: ['Salesforce Service Cloud'],
              },
              {
                key: 'five9',
                label: 'Five9',
                status: 'UNVERIFIED',
                generationBlocking: true,
                evidenceRefs: [],
              },
            ],
          },
        },
      },
      createdAt: new Date(),
    });
    jobRepository.findOne.mockResolvedValue(defaultJobRecord);
    const baselineRepo = service['baselineRepository'] as { findOne: jest.Mock };
    baselineRepo.findOne.mockResolvedValue({
      ...baseline,
      sections: [],
      parsedRecords: [],
    });
    const baselineSectionRepo = service['baselineSectionRepository'] as {
      find: jest.Mock;
    };
    baselineSectionRepo.find.mockResolvedValue([]);

    const refreshSpy = jest
      .spyOn(service as any, 'refreshToolingCoverageForAssessment')
      .mockResolvedValue({
        ...sampleScoringV2,
        debug: {
          ...(sampleScoringV2.debug ?? {}),
          toolingCoverage: {
            requiredCoverage: 0.5,
            preferredCoverage: 0.5,
            claims: [
              {
                key: 'salesforce',
                label: 'Salesforce',
                status: 'EQUIVALENT',
                generationBlocking: false,
                evidenceRefs: ['Salesforce Service Cloud'],
              },
              {
                key: 'five9',
                label: 'Five9',
                status: 'UNVERIFIED',
                generationBlocking: true,
                evidenceRefs: [],
              },
            ],
          },
        },
      } as any);

    const result = await service.getFitAssessmentById('user-1', 'fit-1');

    expect(refreshSpy).toHaveBeenCalled();
    expect(result.verification_coverage).toEqual(
      expect.objectContaining({
        totalClaims: 2,
        verifiedClaims: 0,
        inferredClaims: 1,
        unverifiedClaims: 1,
        unverifiedRequirements: ['Five9'],
      }),
    );
  });

  it('normalizes canonical claim status and label variants for verification coverage counts', async () => {
    fitAssessmentRepository.findOne.mockResolvedValue({
      id: 'fit-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'b-1',
      baselineVersion: 2,
      overallScore: 82,
      verdict: 'APPLY',
      dimensionScores: {
        experienceAlignment: 10,
        leadershipLevel: 9,
        technicalPlatformFit: 8,
        industryContext: 7,
        strategicTacticalFit: 6,
      },
      strengths: ['aws'],
      gaps: ['golang'],
      complianceFlags: [],
      scoringV2: sampleScoringV2,
      createdAt: new Date(),
    });
    jobRepository.findOne.mockResolvedValue(defaultJobRecord);
    const baselineRepo = service['baselineRepository'] as { findOne: jest.Mock };
    baselineRepo.findOne.mockResolvedValue({
      ...baseline,
      sections: [],
      parsedRecords: [],
    });
    const baselineSectionRepo = service['baselineSectionRepository'] as {
      find: jest.Mock;
    };
    baselineSectionRepo.find.mockResolvedValue([]);

    jest
      .spyOn(service as any, 'refreshToolingCoverageForAssessment')
      .mockResolvedValue({
        ...sampleScoringV2,
        debug: {
          ...(sampleScoringV2.debug ?? {}),
          toolingCoverage: {
            requiredCoverage: 0.5,
            preferredCoverage: 0.5,
            claims: [
              {
                key: 'salesforce',
                name: 'Salesforce',
                status: 'verified',
                generationBlocking: false,
                evidenceRefs: ['Salesforce Service Cloud'],
              },
              {
                key: 'zendesk',
                requirement: 'Zendesk',
                verificationStatus: 'adjacent',
                generationBlocking: false,
                evidenceRefs: ['Ticketing tools'],
              },
              {
                key: 'five9',
                claim: 'Five9',
                claimStatus: 'UNVERIFIED',
                generationBlocking: true,
                evidenceRefs: [],
              },
            ],
          },
        },
      } as any);

    const result = await service.getFitAssessmentById('user-1', 'fit-1');

    expect(result.verification_coverage).toEqual(
      expect.objectContaining({
        totalClaims: 3,
        verifiedClaims: 1,
        inferredClaims: 1,
        unverifiedClaims: 1,
        unverifiedRequirements: ['Five9'],
      }),
    );
  });

  it('builds toolingCoverage.claims from canonical version-scoped baseline evidence in final analysis payload', async () => {
    jobRepository.findOne.mockResolvedValue({
      ...defaultJobRecord,
      rawDescription: 'Must have Salesforce experience for support operations.',
      normalizedResponsibilities: [],
      normalizedRequirements: [],
    });

    const baselineRepo = service['baselineRepository'] as { findOne: jest.Mock };
    baselineRepo.findOne.mockResolvedValue({
      ...baseline,
      sections: [
        {
          id: 's-no-sf',
          baselineId: 'b-1',
          sectionType: 'EXPERIENCE',
          title: 'Experience',
          content: 'Led customer support operations and escalation workflows.',
          includePolicy: BaselineIncludePolicy.OPTIONAL,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      parsedRecords: [],
    });

    baselineVersionRepository.findOne.mockResolvedValue({
      ...baselineVersion,
      id: 'bv-1',
      baselineId: 'b-1',
      versionNumber: 2,
      verifiedAdditions: ['Owned case routing and administration in Salesforce Service Cloud.'],
    });

    const baselineBlockPolicyRepo = service['baselineBlockPolicyRepository'] as {
      find: jest.Mock;
    };
    baselineBlockPolicyRepo.find.mockResolvedValue([]);

    fitAssessmentRepository.findOne.mockResolvedValue({
      id: 'fit-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'b-1',
      baselineVersion: 2,
      overallScore: 82,
      verdict: 'APPLY',
      dimensionScores: {
        experienceAlignment: 10,
        leadershipLevel: 9,
        technicalPlatformFit: 8,
        industryContext: 7,
        strategicTacticalFit: 6,
      },
      strengths: ['aws'],
      gaps: ['golang'],
      complianceFlags: [],
      scoringV2: sampleScoringV2,
      createdAt: new Date(),
    });

    const result = await service.getFitAssessmentById('user-1', 'fit-1');
    const claims = result.scoring_v2?.debug?.toolingCoverage?.claims ?? [];
    const salesforceClaim = claims.find((claim) => claim.key === 'salesforce');

    expect(salesforceClaim?.status).toBe('VERIFIED');
    expect(salesforceClaim?.evidenceRefs?.[0]).toContain('Salesforce Service Cloud');
    expect(claims.filter((claim) => claim.status === 'VERIFIED').length).toBeGreaterThan(0);
  });

  it('forces fresh recomputation when fetching fit assessment by id and returns the recomputed assessment payload', async () => {
    fitAssessmentRepository.findOne
      .mockResolvedValueOnce({
        id: 'fit-old',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: 2,
        overallScore: 82,
        verdict: 'APPLY',
        dimensionScores: {
          experienceAlignment: 10,
          leadershipLevel: 9,
          technicalPlatformFit: 8,
          industryContext: 7,
          strategicTacticalFit: 6,
        },
        strengths: ['aws'],
        gaps: ['golang'],
        complianceFlags: [],
        scoringV2: sampleScoringV2,
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'fit-fresh',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: 2,
        overallScore: 86,
        verdict: 'APPLY',
        dimensionScores: {
          experienceAlignment: 10,
          leadershipLevel: 9,
          technicalPlatformFit: 8,
          industryContext: 7,
          strategicTacticalFit: 6,
        },
        strengths: ['aws'],
        gaps: ['golang'],
        complianceFlags: [],
        scoringV2: sampleScoringV2,
        createdAt: new Date(),
      });

    const runFitAssessmentSpy = jest
      .spyOn(service as any, 'runFitAssessment')
      .mockResolvedValue({
        status: 'ok',
        assessmentId: 'fit-fresh',
      });

    const result = await service.getFitAssessmentById('user-1', 'fit-old', {
      forceFreshRecompute: true,
    });

    expect(runFitAssessmentSpy).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: 2,
      }),
    );
    expect(result.assessmentId).toBe('fit-fresh');
  });

  it('returns fresh recomputed Studio payload claims with Salesforce verified when forceFreshRecompute is enabled', async () => {
    const salesforceSections: BaselineSection[] = [
      {
        id: 's-exp',
        baselineId: 'b-1',
        sectionType: 'EXPERIENCE' as any,
        title: 'Experience',
        content: 'Owned escalation and workflow administration in Salesforce Service Cloud.',
        includePolicy: BaselineIncludePolicy.OPTIONAL,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as BaselineSection,
    ];

    jobRepository.findOne.mockResolvedValue({
      ...defaultJobRecord,
      rawDescription: 'Must have Salesforce experience for support operations.',
      normalizedResponsibilities: [],
      normalizedRequirements: [],
    });

    const baselineRepo = service['baselineRepository'] as { findOne: jest.Mock };
    baselineRepo.findOne.mockResolvedValue({
      ...baseline,
      sections: salesforceSections,
      parsedRecords: [],
    });

    const baselineSectionRepo = service['baselineSectionRepository'] as {
      find: jest.Mock;
    };
    baselineSectionRepo.find.mockResolvedValue(salesforceSections);

    fitAssessmentRepository.findOne
      .mockResolvedValueOnce({
        id: 'fit-old',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: 2,
        overallScore: 80,
        verdict: 'APPLY',
        dimensionScores: {
          experienceAlignment: 10,
          leadershipLevel: 9,
          technicalPlatformFit: 8,
          industryContext: 7,
          strategicTacticalFit: 6,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        scoringV2: sampleScoringV2,
        createdAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'fit-fresh',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: 2,
        overallScore: 86,
        verdict: 'APPLY',
        dimensionScores: {
          experienceAlignment: 10,
          leadershipLevel: 9,
          technicalPlatformFit: 8,
          industryContext: 7,
          strategicTacticalFit: 6,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        scoringV2: sampleScoringV2,
        createdAt: new Date(),
      });

    const runFitAssessmentSpy = jest
      .spyOn(service as any, 'runFitAssessment')
      .mockResolvedValue({
        status: 'ok',
        assessmentId: 'fit-fresh',
      });

    const payload = await service.getFitAssessmentById('user-1', 'fit-old', {
      forceFreshRecompute: true,
    });

    expect(runFitAssessmentSpy).toHaveBeenCalled();
    const claims = payload.scoring_v2?.debug?.toolingCoverage?.claims ?? [];
    const salesforceClaim = claims.find((claim) => claim.key === 'salesforce');
    expect(salesforceClaim?.status).toBe('VERIFIED');
    expect(
      claims
        .filter((claim) => claim.status !== 'VERIFIED')
        .map((claim) => claim.key),
    ).not.toContain('salesforce');
  });

  it('exposes score_breakdown invariants for latest assessment payload', async () => {
    fitAssessmentRepository.findOne.mockResolvedValue({
      id: 'fit-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'b-1',
      baselineVersion: 2,
      overallScore: 82,
      verdict: 'APPLY',
      dimensionScores: {
        experienceAlignment: 10,
        leadershipLevel: 9,
        technicalPlatformFit: 8,
        industryContext: 7,
        strategicTacticalFit: 6,
      },
      strengths: ['aws'],
      gaps: ['golang'],
      complianceFlags: [],
      scoringV2: sampleScoringV2,
      createdAt: new Date(),
    });

    const result = await service.getFitAssessmentById('user-1', 'fit-1');
    const breakdown = result.score_breakdown;

    expect(breakdown).toBeDefined();
    expect(breakdown.dimensions).toHaveLength(5);
    expect(breakdown.total_score).toBeCloseTo(
      breakdown.dimensions.reduce((sum, dim) => sum + dim.score, 0),
      5,
    );
    breakdown.dimensions.forEach((dimension) => {
      expect(dimension.score).toBeGreaterThanOrEqual(0);
      expect(dimension.score).toBeLessThanOrEqual(dimension.weight);
    });
  });

  it('rejects ambiguous JD inputs', async () => {
    expect.assertions(1);
    try {
      service['assertJobInput']({
        raw_jd_text: 'text',
        parsed_jd: { requirements: ['x'] },
      } as unknown as RunFitAssessmentDto['job']);
      throw new Error('Expected JD_INPUT_AMBIGUOUS error');
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          error: expect.objectContaining({ code: 'JD_INPUT_AMBIGUOUS' }),
        }),
      });
    }
  });

  it('rejects missing JD inputs', async () => {
    expect.assertions(1);
    try {
      service['assertJobInput']({} as unknown as RunFitAssessmentDto['job']);
      throw new Error('Expected JD_INPUT_MISSING error');
    } catch (error) {
      expect(error).toMatchObject({
        response: expect.objectContaining({
          error: expect.objectContaining({ code: 'JD_INPUT_MISSING' }),
        }),
      });
    }
  });

  it('returns a contract-compliant success response', async () => {
    const result = await service.scoreCompatibility('user-1', {
      baseline_version_id: 'bv-1',
      job: {
        raw_jd_text: 'Lead cloud platforms with AWS and Kubernetes expertise.',
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        fit_score: expect.any(Number),
        overall_score: expect.any(Number),
        verdict: expect.any(String),
        breakdown: expect.objectContaining({
          experience_alignment: expect.any(Number),
          leadership_level: expect.any(Number),
          technical_platform_fit: expect.any(Number),
          industry_context: expect.any(Number),
          strategic_vs_tactical: expect.any(Number),
        }),
      }),
    );
    expect(result.strengths).toBeDefined();
    expect(result.scoring_v2).toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        rubric: expect.objectContaining({
          dimensionPercents: expect.any(Object),
          dimensionPoints: expect.any(Object),
        }),
        debug: expect.any(Object),
      }),
    );
    expect(result.audit_id).toBe('audit-1');
    expect(result.auditId).toBe('audit-1');
  });

  it('creates a compliance audit for fit score requests', async () => {
    await service.scoreCompatibility('user-1', {
      baseline_version_id: 'bv-1',
      job: { raw_jd_text: 'Drive impact with measurable leadership results.' },
    });

    expect(complianceService.validateAndAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ComplianceAction.FIT_SCORE,
        actorId: 'user-1',
        outputHash: expect.any(String),
      }),
    );
  });

  it('returns scoring proof data when running a fit assessment', async () => {
    const jobRecord: Partial<Job> = {
      id: 'job-1',
      userId: 'user-1',
      rawDescription: 'Lead operations with AWS focus.',
      normalizedResponsibilities: [],
      normalizedRequirements: [],
      jdIngestionMethod: JobIngestionMethod.PASTE,
      title: 'Cloud Lead',
      company: 'ExampleCo',
      sourceUrl: null,
    };
    jobRepository.findOne.mockResolvedValue(jobRecord);

    const result = await service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-1',
      baselineVersion: 2,
    });

    expect(result.assessmentId).toBe('fit-1');
    expect(result.verdict).toBe('APPLY');
    expect(result.scoringProof?.assessmentId).toBe('fit-1');
    expect(result.scoringProof?.baselineTextCharsScored).toBeGreaterThan(0);
    expect(result.scoringProof?.jobTextCharsScored).toBeGreaterThan(0);
    expect(result.scoringProof).toMatchObject({
      normalizedResponsibilitiesCount: 0,
      normalizedRequirementsCount: 0,
      truncationAppliedBaseline: false,
      truncationAppliedJob: false,
    });
    const rawCharCount = jobRecord.rawDescription.trim().length;
    expect(result.scoringProof?.jobTextCharsScored).toBe(rawCharCount);
    expect(result.scoringProof?.jobTextSource).toBe('raw');
  });

  it('does not classify the first scoring run as stale when raw sections and canonical parsed records differ in ordering', async () => {
    const canonicalBaseline: BaselineSchemaCoreShape = {
      schema_version: 'baseline_schema_v1',
      user_verified: false,
      identity: {
        full_name: 'Test User',
        summary: 'Seasoned operator and platform leader',
        current_title: 'Director of Engineering',
        current_company: 'ExampleCo',
        location: 'Remote',
      },
      experience: [
        {
          company: 'ExampleCo',
          role: 'Director of Engineering',
          start_date: '2020-01',
          end_date: null,
          evidence: [],
          company_name: 'ExampleCo',
          role_title: 'Director of Engineering',
          details_text: 'Led platform and reliability teams.',
        },
      ],
      education: [],
      skills: ['AWS', 'Kubernetes'],
      people_leadership: {
        direct_reports: 8,
        managers_led: 2,
        global_teams: 1,
      },
      operational_ownership: {
        functions_owned: ['Platform'],
        process_design: 'Defined incident response processes',
        process_scaling: 'Scaled runbooks globally',
      },
      tooling_and_platforms: {
        tools: ['AWS', 'Terraform'],
        ownership_level: 'high',
      },
      cross_functional_partnership: {
        product: 'partnered',
        engineering: 'led',
        sales_cs: 'supported',
        executive: 'briefed',
      },
      customer_advocacy: {
        executive_escalations: 'managed',
        voice_of_customer: 'captured',
        post_incident_rca: 'authored',
      },
      scale_and_scope: {
        customer_segment: 'enterprise',
        geo_scope: 'global',
        org_stage: 'growth',
      },
      metrics_and_outcomes: {
        metrics_present: true,
        metrics: ['99.99% uptime'],
      },
      skills_and_tools: {
        tools: ['AWS', 'Kubernetes'],
        methodologies: ['SRE'],
        domains: ['platform'],
      },
      system_generated_read_only: {
        missing_fields: [],
        ambiguity_flags: [],
        low_confidence_extractions: [],
      },
    };

    const rawOrderedSections: BaselineSection[] = [
      {
      id: 'summary-raw',
      baselineId: baseline.id,
      sectionType: BaselineSectionType.SUMMARY,
      title: null,
        content:
          'Test User | Director of Engineering | ExampleCo | Remote | Reliability leadership, platform strategy, and operational scale. '.repeat(3),
        includePolicy: BaselineIncludePolicy.OPTIONAL,
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as BaselineSection,
      {
      id: 'experience-raw',
      baselineId: baseline.id,
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'ExampleCo',
        content:
          'Led platform and reliability teams across incident response, cloud infrastructure, and developer productivity. '.repeat(6),
        includePolicy: BaselineIncludePolicy.OPTIONAL,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as BaselineSection,
    ];

    const parsedRecord = {
      parsedJson: canonicalBaseline,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BaselineParsed;
    const orderedBaseline = {
      ...baseline,
      parsedRecords: [parsedRecord],
      sections: rawOrderedSections,
    };

    const baselineRepo = service['baselineRepository'] as { findOne: jest.Mock };
    baselineRepo.findOne
      .mockResolvedValueOnce(orderedBaseline)
      .mockResolvedValueOnce(orderedBaseline);
    const baselineSectionRepo = service['baselineSectionRepository'] as {
      find: jest.Mock;
    };
    baselineSectionRepo.find.mockResolvedValue(rawOrderedSections);

    const result = await service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-1',
    });

    expect(result.status).toBe('ok');
    expect(result.assessmentId).toBe('fit-1');
  });

  it('keeps stale_request_ignored reserved for real semantic changes during scoring', async () => {
    const initialJob: Partial<Job> = {
      ...defaultJobRecord,
      id: 'job-1',
      rawDescription: 'Lead operations with AWS focus.',
      normalizedResponsibilities: [],
      normalizedRequirements: [],
    };
    const changedJob: Partial<Job> = {
      ...initialJob,
      rawDescription: 'Lead operations with AWS, GCP, and Kubernetes focus.',
    };

    const baselineRepo = service['baselineRepository'] as { findOne: jest.Mock };
    const semanticBaseline = {
      ...baseline,
      parsedRecords: [
        {
          parsedJson: {
            schema_version: 'baseline_schema_v1',
            user_verified: false,
            identity: {
              full_name: 'Test User',
              summary: 'Seasoned operator',
              current_title: 'Director of Engineering',
              current_company: 'ExampleCo',
              location: 'Remote',
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
          } as BaselineSchemaCoreShape,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as BaselineParsed,
      ],
      sections: baselineSections,
    };
    baselineRepo.findOne
      .mockResolvedValueOnce(semanticBaseline)
      .mockResolvedValueOnce(semanticBaseline);

    jobRepository.findOne
      .mockResolvedValueOnce(initialJob)
      .mockResolvedValueOnce(changedJob);

    const runPromise = service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-1',
    });

    await expect(runPromise).rejects.toBeInstanceOf(ConflictException);
    await expect(runPromise).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: 'stale_request_ignored',
        }),
      }),
    });
  });

  it('falls back to baseline sections when canonical data is missing', async () => {
    const fallbackSections: BaselineSection[] = [
      {
        id: 'fallback-1',
        baselineId: baseline.id,
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Fallback Experience',
        content: 'Experience details '.repeat(40),
        includePolicy: BaselineIncludePolicy.OPTIONAL,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const fallbackBaseline: Baseline = {
      ...baseline,
      parsedRecords: [],
      sections: fallbackSections,
    };
    const baselineRepo = service['baselineRepository'] as {
      findOne: jest.Mock;
    };
    baselineRepo.findOne.mockResolvedValue(fallbackBaseline);
    jobRepository.findOne.mockResolvedValue({
      ...defaultJobRecord,
      id: 'job-1',
    });

    const baselineSectionRepo = service['baselineSectionRepository'] as {
      createQueryBuilder: jest.Mock;
    };
    baselineSectionRepo.createQueryBuilder = jest
      .fn()
      .mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          sectionCount: '1',
          totalChars: '620',
        }),
      });
    const logSpy = jest.spyOn(service as any, 'logPipelineEvent');
    const result = await service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-1',
    });

    expect(result.status).toBe('ok');
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('canonical_baseline_fallback'),
      expect.objectContaining({
        fallbackReason: 'missing_or_invalid_canonical',
      }),
    );
    logSpy.mockRestore();
  });

  it('derives a fallback baseline hash when stored hash is missing', async () => {
    const canonicalBaseline: BaselineSchemaCoreShape = {
      schema_version: 'baseline_schema_v1',
      user_verified: false,
      identity: {
        full_name: 'Test User',
        summary: null,
        current_title: null,
        current_company: null,
        location: 'Remote',
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
    };
    const parsedRecord = {
      parsedJson: canonicalBaseline,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BaselineParsed;

    const baselineRepo = service['baselineRepository'] as { findOne: jest.Mock };
    baselineRepo.findOne.mockResolvedValueOnce({
      ...baseline,
      hash: null,
      parsedRecords: [parsedRecord],
    });
    const baselineSectionRepo = service['baselineSectionRepository'] as {
      find: jest.Mock;
    };
    baselineSectionRepo.find.mockResolvedValue(baselineSections);

    const expectedHash = createHash('sha256')
      .update(JSON.stringify(canonicalBaseline))
      .digest('hex');

    await service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-1',
    });

    const [validatePayload] = (complianceService.validateAndAudit as jest.Mock).mock.calls[0];
    expect(validatePayload.baselineVersion.hash).toBe(expectedHash);
  });

  it('falls back to normalized segments when the raw description is missing', async () => {
    const fallbackJob: Partial<Job> = {
      id: 'job-2',
      userId: 'user-1',
      rawDescription: '',
      normalizedResponsibilities: ['Drive operational excellence'],
      normalizedRequirements: ['Leader level AWS experience'],
      jdIngestionMethod: JobIngestionMethod.PASTE,
      title: 'Operations Lead',
      company: 'ExampleCo',
      sourceUrl: null,
    };
    jobRepository.findOne.mockResolvedValueOnce(fallbackJob);

    const result = await service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-2',
      baselineVersion: 2,
    });

    expect(result.scoringProof?.jobTextSource).toBe('normalized_fallback');
    expect(result.scoringProof?.jobRawTextCharCount).toBe(0);
    expect(result.scoringProof?.jobTextCharsScored).toBeGreaterThan(0);
  });

  it('returns a compliance_blocked response when validation fails', async () => {
    complianceService.validateAndAudit.mockResolvedValueOnce({
      complianceFlags: [
        {
          code: 'missing-policy',
          severity: ComplianceFlagSeverity.BLOCK,
          message: 'Policy missing',
        },
      ],
      blocked: true,
      audit: {
        id: 'audit-2',
        outputHash: '',
        baselineVersionHash: 'blocked-hash',
        baselineVersionId: 'bv-1',
        action: ComplianceAction.FIT_SCORE,
        actorId: 'user-1',
        jobId: null,
        createdAt: new Date().toISOString(),
      },
    });

    const result = await service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-1',
      baselineVersion: 2,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'compliance_blocked',
        score: null,
        overall_score: null,
        verdict: 'blocked',
        compliance: {
          blocked: true,
          message: 'Compliance validation failed.',
        },
        audit_id: 'audit-2',
        auditId: 'audit-2',
      }),
    );
    expect(result.compliance?.flags).toHaveLength(1);
    expect(result.complianceFlags?.[0]).toEqual(
      expect.objectContaining({ code: 'missing-policy' }),
    );
    expect(result.compliance_flags?.[0]).toEqual(
      expect.objectContaining({ code: 'missing-policy' }),
    );
  });

  it('fails when persisted assessment baseline linkage does not match requested baseline', async () => {
    fitAssessmentRepository.save.mockResolvedValueOnce({
      id: 'fit-mismatch',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'other-baseline',
      baselineVersion: 2,
      overallScore: 81,
      verdict: FitAssessmentVerdict.APPLY,
      createdAt: new Date(),
    });

    await expect(
      service.runFitAssessment('user-1', {
        baselineId: 'b-1',
        jobId: 'job-1',
        baselineVersion: 2,
      }),
    ).rejects.toThrow('Unexpected error while running fit assessment');
  });

  it('does not return success when assessment persistence fails', async () => {
    fitAssessmentRepository.save.mockRejectedValueOnce(new Error('db write failed'));

    await expect(
      service.runFitAssessment('user-1', {
        baselineId: 'b-1',
        jobId: 'job-1',
        baselineVersion: 2,
      }),
    ).rejects.toThrow('Unexpected error while running fit assessment');
  });

  describe('runFitAssessment validation', () => {
    it('returns a detailed error when baselineId is missing', async () => {
      await expect(
        service.runFitAssessment('user-1', {
          baselineId: '',
          jobId: 'job-1',
        } as RunFitAssessmentDto),
      ).rejects.toMatchObject({
        response: { message: 'baselineId is required' },
      });
    });

    it('returns a detailed error when jobId is missing', async () => {
      await expect(
        service.runFitAssessment('user-1', {
          baselineId: 'b-1',
          jobId: '',
        } as RunFitAssessmentDto),
      ).rejects.toMatchObject({
        response: { message: 'jobId is required' },
      });
    });
  });

  describe('latest assessment refresh', () => {
    const refreshJobRecord: Job = {
      id: 'job-1',
      userId: 'user-1',
      rawDescription: '  Lead enterprise programs with narrative clarity.  ',
      normalizedResponsibilities: [],
      normalizedRequirements: [],
      title: 'Strategic Lead',
      company: 'ExampleCo',
      sourceUrl: 'https://example.com/jobs/leadership',
      jdIngestionMethod: JobIngestionMethod.PASTE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Job;

    const dimensionWeights = {
      experienceAlignment: 1,
      leadershipLevel: 1,
      technicalPlatformFit: 1,
      industryContext: 1,
      strategicTacticalFit: 1,
    };

    let expectedHash: string;
    let legacyExpectedHash: string;

    beforeEach(async () => {
      jobRepository.findOne.mockResolvedValue(refreshJobRecord);
      expectedHash = await service['computeExpectedInputsHashForJobBaseline'](
        'user-1',
        refreshJobRecord,
        baseline,
      );
      legacyExpectedHash = createHash('sha256')
        .update(
          JSON.stringify({
            scoringVersion: 'cx-fit-v2-heuristics-2026-04-06',
            normalizationVersion: 'job-normalization-sanitization-2026-04-06',
            job: {
              rawDescription: refreshJobRecord.rawDescription,
              normalizedResponsibilities: refreshJobRecord.normalizedResponsibilities,
              normalizedRequirements: refreshJobRecord.normalizedRequirements,
              title: refreshJobRecord.title ?? null,
              company: refreshJobRecord.company ?? null,
            },
            baseline: {
              id: baseline.id,
              version: baseline.version ?? null,
              sections: service['buildSectionPayload'](
                service['getIncludedSections'](baseline.sections),
              ),
            },
            calibration: dimensionWeights,
          }),
        )
        .digest('hex');
    });

    it('buildInputsHash ignores normalized segments when raw description exists', () => {
      const rawDescription = refreshJobRecord.rawDescription;

      const filteredSections = service['getIncludedSections'](baseline.sections);
      const sectionPayload = service['buildSectionPayload'](filteredSections);

      const { canonicalJobForHash: canonicalWith } = service[
        'buildCanonicalJobAssets'
      ]({
        rawDescription,
        normalizedResponsibilities: ['Lead teams'],
        normalizedRequirements: ['Executive-level experience'],
        title: refreshJobRecord.title,
        company: refreshJobRecord.company,
        sourceUrl: refreshJobRecord.sourceUrl,
      });

      const { canonicalJobForHash: canonicalWithout } = service[
        'buildCanonicalJobAssets'
      ]({
        rawDescription,
        normalizedResponsibilities: [],
        normalizedRequirements: [],
        title: refreshJobRecord.title,
        company: refreshJobRecord.company,
        sourceUrl: refreshJobRecord.sourceUrl,
      });

      const hashWithNormalized = service['buildInputsHash'](
        canonicalWith,
        baseline.id,
        baseline.version ?? null,
        sectionPayload,
        dimensionWeights,
      );
      const hashWithoutNormalized = service['buildInputsHash'](
        canonicalWithout,
        baseline.id,
        baseline.version ?? null,
        sectionPayload,
        dimensionWeights,
      );

      expect(hashWithoutNormalized).toBe(hashWithNormalized);
    });

    it('returns the stored assessment when inputs hash matches', async () => {
      const storedAssessment: FitAssessment = {
        id: 'fit-old',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: baseline.version,
        overallScore: 72,
        verdict: FitAssessmentVerdict.APPLY,
        dimensionScores: {
          experienceAlignment: 70,
          leadershipLevel: 70,
          technicalPlatformFit: 70,
          industryContext: 70,
          strategicTacticalFit: 70,
        },
        strengths: ['leadership'],
        gaps: ['detail'],
      complianceFlags: [],
      scoringV2: sampleScoringV2,
      inputsHash: expectedHash,
      createdAt: new Date(),
      updatedAt: new Date(),
      };

      fitAssessmentRepository.findOne.mockResolvedValue(storedAssessment);

      const result = await service.getLatestAssessmentForBaseline(
        'user-1',
        'job-1',
        'b-1',
      );

      expect(result.assessmentId).toBe(storedAssessment.id);
      expect(result.overallScore).toBe(storedAssessment.overallScore);
      expect(fitScoringServiceMock.score).not.toHaveBeenCalled();
    });

    it('recomputes when the stored inputs hash is stale', async () => {
      const staleAssessment: FitAssessment = {
        id: 'fit-old',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: baseline.version,
        overallScore: 41,
        verdict: FitAssessmentVerdict.CONSIDER,
        dimensionScores: {
          experienceAlignment: 40,
          leadershipLevel: 40,
          technicalPlatformFit: 40,
          industryContext: 40,
          strategicTacticalFit: 40,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        scoringV2: null,
        inputsHash: 'stale-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let savedAssessment: FitAssessment | null = null;

      fitAssessmentRepository.save.mockImplementation(async (payload) => {
        savedAssessment = {
          ...payload,
          id: 'fresh-fit',
          createdAt: new Date(),
        } as FitAssessment;
        return savedAssessment;
      });

      fitAssessmentRepository.findOne.mockImplementation(({ where }) => {
        if (where?.id) {
          return Promise.resolve(savedAssessment);
        }
        return Promise.resolve(staleAssessment);
      });

      const result = await service.getLatestAssessmentForBaseline(
        'user-1',
        'job-1',
        'b-1',
      );

      expect(fitScoringServiceMock.score).toHaveBeenCalled();
      expect(savedAssessment).not.toBeNull();
      expect(savedAssessment?.inputsHash).toBe(expectedHash);
      expect(result.assessmentId).toBe(savedAssessment?.id);
    });

    it('recomputes when a legacy persisted hash predates the scorer version', async () => {
      const legacyAssessment: FitAssessment = {
        id: 'fit-legacy',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: baseline.version,
        overallScore: 48,
        verdict: FitAssessmentVerdict.CONSIDER,
        dimensionScores: {
          experienceAlignment: 45,
          leadershipLevel: 45,
          technicalPlatformFit: 45,
          industryContext: 45,
          strategicTacticalFit: 45,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        scoringV2: null,
        inputsHash: legacyExpectedHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let savedAssessment: FitAssessment | null = null;

      fitAssessmentRepository.save.mockImplementation(async (payload) => {
        savedAssessment = {
          ...payload,
          id: 'fresh-fit-versioned',
          createdAt: new Date(),
        } as FitAssessment;
        return savedAssessment;
      });

      fitAssessmentRepository.findOne.mockImplementation(({ where }) => {
        if (where?.id) {
          return Promise.resolve(savedAssessment);
        }
        return Promise.resolve(legacyAssessment);
      });

      const result = await service.getLatestAssessmentForBaseline(
        'user-1',
        'job-1',
        'b-1',
      );

      expect(legacyExpectedHash).not.toBe(expectedHash);
      expect(fitScoringServiceMock.score).toHaveBeenCalled();
      expect(savedAssessment?.inputsHash).toBe(expectedHash);
      expect(result.assessmentId).toBe(savedAssessment?.id);
    });
  });

  describe('calibrated scoring', () => {
    it('returns a calibration payload with delta metadata', async () => {
      const assessmentRecord: FitAssessment = {
        id: 'fit-1',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: baseline.version,
        overallScore: 70,
        verdict: FitAssessmentVerdict.CONSIDER,
        dimensionScores: {
          experienceAlignment: 70,
          leadershipLevel: 70,
          technicalPlatformFit: 70,
          industryContext: 70,
          strategicTacticalFit: 70,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        inputsHash: 'hash-1',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      };

      fitAssessmentRepository.findOne.mockResolvedValueOnce(assessmentRecord);

      const result = await service.calibrateAssessment(
        'user-1',
        'fit-1',
        'aggressive',
      );

      expect(result.ok).toBe(true);
      expect(result.assessmentId).toBe('fit-1');
      expect(result.overallScore).toBe(82);
      expect(result.baselineVersionId).toBe('bv-1');
      expect(result.summary).toBe('No keywords found in the job description.');
      expect(result.calibration).toMatchObject({
        profile: 'aggressive',
        label: 'Aggressive',
        delta: 12,
      });
    });

    it('rejects unsupported profiles', async () => {
      await expect(
        service.calibrateAssessment(
          'user-1',
          'fit-1',
          'unsupported' as CalibrationProfile,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
