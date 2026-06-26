import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineParsed } from '../baseline/baseline-parsed.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineParsed } from '../baseline/baseline-parsed.entity';
import {
  BaselineSchema,
  BaselineSchemaCoreShape,
} from '../baseline/baseline-schema';
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
import { ANALYSIS_RUN_CACHE_VERSION } from './analysis.service';
import { FitAssessment, FitAssessmentVerdict } from './fit-assessment.entity';
import { FitScoringService } from './fit-scoring.service';
import { GapAnalysisService } from './gap-analysis.service';
import { WorkflowIdempotencyService } from '../common/workflow-idempotency.service';
import { ResumeService } from '../resume/resume.service';
import { CoverLettersService } from '../cover-letters/cover-letters.service';
import type { CalibrationProfile } from './calibration-profiles';
import type { RunFitAssessmentDto } from './dto/run-fit-assessment.dto';
import { CX_FIT_SCORER_VERSION, scoreCxFitV2, type CxFitV2Result } from './cx-fit-scoring-v2';
import { resetBetaAccessSchemaCompatForTests } from '../users/beta-access-schema-compat';

jest.mock('./cx-fit-scoring-v2', () => ({
  ...jest.requireActual('./cx-fit-scoring-v2'),
  scoreCxFitV2: jest.fn(),
}));

describe('AnalysisService - fit scores contract', () => {
  let service: AnalysisService;
  let complianceService: ComplianceService;
  let baselineVersionRepository: { findOne: jest.Mock };
  let baselineRepository: {
    findOne: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let baselineParsedRepository: { update: jest.Mock };
  let usersRepository: { findOne: jest.Mock; update: jest.Mock; save: jest.Mock };
  let fitAssessmentRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { getRepository: jest.Mock };
  };
  let studioArtifactRepositoryMock: { findOne: jest.Mock };
  let jobRepository: { findOne: jest.Mock };
  let fitAssessmentQueryBuilder: {
    select: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getOne: jest.Mock;
  };
  let fitScoringServiceMock: { score: jest.Mock };
  let resumeServiceMock: { generateResume: jest.Mock };
  let coverLettersServiceMock: { generateCoverLetter: jest.Mock };

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
    parsedRecords: [
      {
        id: 'parsed-1',
        baselineId: 'b-1',
        parsedJson: {
          baseline_id: '11111111-1111-4111-8111-111111111111',
          source_file_id: '11111111-1111-4111-8111-111111111112',
          source_format: 'pdf',
          ingested_at: new Date().toISOString(),
          schema_version: 'baseline_schema_v1',
          user_verified: true,
          identity: {
            full_name: 'Test User',
            summary: 'Seasoned support operations and platform leader',
            current_title: 'Director of Support Operations',
            current_company: 'ExampleCo',
            location: 'Remote',
          },
          experience: [
            {
              company: 'ExampleCo',
              role: 'Director of Support Operations',
              company_name: 'ExampleCo',
              role_title: 'Director of Support Operations',
              start_date: '2020-01',
              end_date: '2024-03',
              evidence: [{ id: 'e-1', text: 'Led support operations for a global SaaS team.', metrics: [], tags: [] }],
              details_text:
                'Led support operations for a global SaaS team.\nBuilt incident response runbooks and staffing workflows.\nPartnered cross-functionally to improve SLA adherence.',
            },
          ],
          education: [],
          skills: [{ name: 'ServiceNow', category: null }],
          people_leadership: {
            direct_reports: 12,
            managers_led: true,
            global_teams: true,
          },
          operational_ownership: {
            functions_owned: ['support operations', 'incident management'],
            process_design: true,
            process_scaling: true,
          },
          tooling_and_platforms: {
            tools: ['ServiceNow', 'Jira'],
            ownership_level: 'owned',
          },
          cross_functional_partnership: {
            product: true,
            engineering: true,
            sales_cs: true,
            executive: true,
          },
          customer_advocacy: {
            executive_escalations: true,
            voice_of_customer: true,
            post_incident_rca: true,
          },
          scale_and_scope: {
            customer_segment: 'enterprise',
            geo_scope: 'global',
            org_stage: 'growth',
          },
          metrics_and_outcomes: {
            metrics_present: true,
            metrics: ['Reduced MTTR by 25%'],
          },
          skills_and_tools: {
            tools: ['ServiceNow', 'Jira'],
            methodologies: ['ITIL'],
            domains: ['SaaS'],
          },
          system_generated_read_only: {
            missing_fields: [],
            ambiguity_flags: [],
            low_confidence_extractions: [],
          },
        },
        resumeV2Json: {
          heading: { name: 'Test User', contactLine: 'test@example.com' },
          summary: 'Test',
          experience: [
            {
              company: 'ExampleCo',
              roleTitle: 'Engineer',
              startDate: '2020-01',
              endDate: '2021-01',
              bullets: ['Led ops.'],
            },
          ],
        },
        createdAt: new Date(),
      } as any,
    ],
    versions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const canonicalResumeV2 = {
    heading: {
      name: 'Test User',
      contactLine: 'test@example.com',
    },
    summary: 'Test',
    experience: [
      {
        company: 'ExampleCo',
        roleTitle: 'Engineer',
        startDate: '2020-01',
        endDate: '2021-01',
        bullets: ['Led ops.'],
      },
    ],
    education: [],
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
    // Keep JD long enough to satisfy scoring reliability guards in the canonical scoring contract.
    rawDescription:
      'Lead support operations and process rigor for a scaling SaaS team. '
        .repeat(80) +
      'Own incident response, queue health, SLA adherence, tooling strategy, and cross-functional execution. '
        .repeat(80),
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
  score: 90,
  scorerVersion: CX_FIT_SCORER_VERSION,
  scoreConfidence: 0.85,
  scoreConfidenceReasons: [],
  scoreSanityFlags: [],
  likelyUnderestimatedFit: false,
  scorePresentationMode: 'score',
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
      role_scope_and_seniority: 90,
      support_operations_and_process_rigor: 90,
      tooling_and_platform_experience: 90,
      domain_and_business_context: 90,
      change_leadership_and_customer_advocacy: 90,
    },
    dimensionPoints: {
      role_scope_and_seniority: 23,
      support_operations_and_process_rigor: 23,
      tooling_and_platform_experience: 18,
      domain_and_business_context: 14,
      change_leadership_and_customer_advocacy: 14,
    },
    subtotal: 92,
    resumeProject: {
      id: 'resume_project_cx_fit_v1',
      weights: {
        experience_alignment: 30,
        leadership_level: 20,
        technical_and_platform_fit: 20,
        industry_and_context_fit: 15,
        strategic_vs_tactical_balance: 15,
      },
      categories: {
        experience_alignment: 25,
        leadership_level: 20,
        technical_and_platform_fit: 20,
        industry_and_context_fit: 15,
        strategic_vs_tactical_balance: 10,
      },
      categoryPercents: {
        experience_alignment: 83.3333333333,
        leadership_level: 100,
        technical_and_platform_fit: 100,
        industry_and_context_fit: 100,
        strategic_vs_tactical_balance: 66.6666666667,
      },
      categoryPoints: {
        experience_alignment: 25,
        leadership_level: 20,
        technical_and_platform_fit: 20,
        industry_and_context_fit: 15,
        strategic_vs_tactical_balance: 10,
      },
      subtotal: 90,
      totalScore: 90,
      finalScore: 90,
      rounding: 'round_half_up_final_only',
    },
    penalties: [],
    finalBeforeClamp: 90,
    rounding: 'round_half_up_final_only',
  },
  debug: {
    jobScoringTextSource: 'raw',
    baselineBand: 'L4',
    roleBand: 'L4',
    bandDelta: 0,
    heuristicInference: {
      usedHeuristicInference: false,
      heuristicLiftTotal: 0,
    },
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
    resetBetaAccessSchemaCompatForTests();
    (scoreCxFitV2 as unknown as jest.Mock).mockReturnValue(sampleScoringV2);

    baselineVersionRepository = {
      findOne: jest.fn().mockResolvedValue(baselineVersion),
    };
    baselineRepository = {
      findOne: jest.fn().mockResolvedValue(baseline),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          ...baseline,
          sections: baselineSections,
          parsedRecords: [
            {
              id: 'parsed-1',
              baselineId: 'b-1',
              parsedJson: {
                schema_version: 'baseline_schema_v1',
                user_verified: true,
                identity: {
                  full_name: 'Test User',
                  summary: 'Test',
                  current_title: 'Engineer',
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
              },
              resumeV2Json: {
                heading: { name: 'Test User', contactLine: 'test@example.com' },
                summary: 'Test',
                experience: [
                  {
                    company: 'ExampleCo',
                    roleTitle: 'Engineer',
                    startDate: '2020-01',
                    endDate: '2021-01',
                    bullets: ['Led ops.'],
                  },
                ],
              },
              createdAt: new Date(),
              flagsJson: {
                reviewState: {
                  verified: true,
                },
              },
            },
          ],
        }),
      }),
    };
    baselineParsedRepository = {
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
    fitAssessmentQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
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
        confidenceScore: 77,
        confidenceReasons: ['persisted'],
        scoringReliability: 'ok',
        scoringReliabilityReason: null,
        scoringV2: sampleScoringV2,
        jobAnalysis: null,
        fitScore: null,
        inputsHash: 'hash-1',
        createdAt: new Date(),
      }),
    };
    fitScoringServiceMock = {
      buildComplianceFlags: jest.fn().mockReturnValue([]),
      scoreCxFitV2Authenticated: jest.fn((input, options) =>
        scoreCxFitV2(input, options),
      ),
      computeCxFitV2ConfidenceScore: jest.fn().mockReturnValue({
        confidenceScore: 0.86,
        confidenceReasons: [],
      }),
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
    resumeServiceMock = {
      generateResume: jest.fn().mockResolvedValue({ status: 'success' }),
    };
    coverLettersServiceMock = {
      generateCoverLetter: jest.fn().mockResolvedValue({ status: 'success' }),
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
          provide: ResumeService,
          useValue: resumeServiceMock,
        },
        {
          provide: CoverLettersService,
          useValue: coverLettersServiceMock,
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
          provide: getRepositoryToken(BaselineParsed),
          useValue: baselineParsedRepository,
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
      createQueryBuilder: jest.fn().mockReturnValue(fitAssessmentQueryBuilder),
      manager: {
        getRepository: jest.fn(),
      },
    };
    studioArtifactRepositoryMock = { findOne: jest.fn() };
    fitAssessmentRepository.manager.getRepository.mockReturnValue(studioArtifactRepositoryMock);

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

  it.skip('includes scoring_v2 from the stored assessment payload', async () => {
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
      jobAnalysis: {
        jobText: 'Lead support operations.',
        responsibilities: ['Lead support operations.'],
        requirements: ['AWS expertise required.'],
        skills: ['lead'],
        sourceEvidence: ['Lead support operations.'],
      },
      fitScore: {
        score: 68,
        verdict: 'consider',
        matchedSignals: ['aws'],
        gapSignals: ['golang'],
        sourceEvidence: ['Lead support operations.', 'aws', 'golang'],
      },
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
    expect(result.jobAnalysis).toEqual(
      expect.objectContaining({
        jobText: 'Lead support operations.',
      }),
    );
    expect(result.fitScore).toEqual(
      expect.objectContaining({
        score: 68,
        verdict: 'consider',
      }),
    );
  });

  it('loads persisted assessment by id without recomputing or fallback lookups', async () => {
    fitAssessmentQueryBuilder.getOne.mockResolvedValue({
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
      confidenceScore: 77,
      confidenceReasons: ['persisted'],
      scoringReliability: 'ok',
      scoringReliabilityReason: null,
      scoringV2: sampleScoringV2,
      jobAnalysis: null,
      fitScore: null,
      inputsHash: 'hash-1',
      createdAt: new Date(),
    });

    const result = await service.getFitAssessmentById('user-1', 'fit-1');

    expect(fitAssessmentRepository.createQueryBuilder).toHaveBeenCalledWith('assessment');
    expect(fitAssessmentQueryBuilder.select).toHaveBeenCalled();
    expect(fitAssessmentQueryBuilder.where).toHaveBeenCalledWith('assessment.id = :assessmentId', {
      assessmentId: 'fit-1',
    });
    expect(fitAssessmentQueryBuilder.andWhere).toHaveBeenCalledWith('assessment.userId = :userId', {
      userId: 'user-1',
    });
    expect(jobRepository.findOne).not.toHaveBeenCalled();
    expect(baselineRepository.findOne).not.toHaveBeenCalled();
    expect(result.assessmentId).toBe('fit-1');
    expect(result.baselineId).toBe('b-1');
    expect(result.ok).toBe(true);
    expect(result.scoring_v2).toBe(sampleScoringV2);
  });

  it('returns 404 when the persisted assessment id does not exist', async () => {
    fitAssessmentQueryBuilder.getOne.mockResolvedValue(null);

    await expect(service.getFitAssessmentById('user-1', 'missing-fit')).rejects.toMatchObject({
      response: { message: 'Fit assessment not found' },
      status: 404,
    });
  });

  it('returns 409 when a required persisted field is missing', async () => {
    fitAssessmentQueryBuilder.getOne.mockResolvedValue({
      id: 'fit-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'b-1',
      baselineVersion: 2,
      overallScore: null,
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
      confidenceScore: null,
      confidenceReasons: null,
      scoringReliability: 'ok',
      scoringReliabilityReason: null,
      scoringV2: sampleScoringV2,
      jobAnalysis: null,
      fitScore: null,
      inputsHash: 'hash-1',
      createdAt: new Date(),
    });

    await expect(service.getFitAssessmentById('user-1', 'fit-1')).rejects.toMatchObject({
      response: {
        message: 'Persisted fit assessment is missing a required field',
        missingField: 'overallScore',
        assessmentId: 'fit-1',
      },
      status: 409,
    });
  });

  it.skip('maps equivalent canonical claim statuses to inferred in analysis verification coverage', async () => {
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

  it.skip('normalizes canonical claim status and label variants for verification coverage counts', async () => {
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

  it.skip('builds toolingCoverage.claims from canonical version-scoped baseline evidence in final analysis payload', async () => {
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

  it.skip('forces fresh recomputation when fetching fit assessment by id and returns the recomputed assessment payload', async () => {
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

  it.skip('returns fresh recomputed Studio payload claims with Salesforce verified when forceFreshRecompute is enabled', async () => {
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

  it.skip('serializes insufficient_baseline_support penalty in scoring_v2 rubric for Fit Review + Studio consumers', async () => {
    const penaltyReason =
      'Score capped below strong-apply territory due to insufficient baseline evidence (baseline_recall=11.2% responsibility_overlap=38.7% required_tool_coverage=9.5%).';

    fitAssessmentRepository.findOne.mockResolvedValue({
      id: 'fit-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'b-1',
      baselineVersion: 2,
      overallScore: 82,
      verdict: 'CONSIDER',
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
        score: 79,
        rubric: {
          ...sampleScoringV2.rubric,
          penalties: [
            ...(sampleScoringV2.rubric.penalties ?? []),
            {
              code: 'insufficient_baseline_support',
              points: 0,
              reason: penaltyReason,
            },
          ],
        },
      },
      createdAt: new Date(),
    });

    const result = await service.getFitAssessmentById('user-1', 'fit-1');

    expect(result.scoring_v2?.score).toBeLessThan(80);
    expect(result.scoring_v2?.score).toBe(79);
    expect(result.scoring_v2?.rubric?.penalties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'insufficient_baseline_support',
          reason: expect.stringContaining('baseline_recall=11.2%'),
        }),
      ]),
    );
    const penalty = (result.scoring_v2?.rubric?.penalties ?? []).find(
      (entry) => entry.code === 'insufficient_baseline_support',
    );
    expect(penalty?.reason).toEqual(expect.stringContaining('responsibility_overlap=38.7%'));
    expect(penalty?.reason).toEqual(expect.stringContaining('required_tool_coverage=9.5%'));
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

  it('returns canonical JobAnalysis from the existing analysis path', async () => {
    const rawDescription = [
      'Responsibilities:',
      '- Lead platform operations and incident response.',
      '- Partner with engineering and support leaders.',
      'Requirements:',
      '- AWS expertise required.',
      '- Kubernetes experience required.',
      '- Incident management and observability.',
    ].join('\n');

    jobRepository.findOne.mockResolvedValue({
      ...defaultJobRecord,
      rawDescription,
    });

    const result = await service.analyzeForUser('user-1', {
      baselineId: 'b-1',
      jobId: 'job-1',
    });

    expect(result.jobAnalysis).toEqual(
      expect.objectContaining({
        jobText: rawDescription,
        responsibilities: expect.arrayContaining([
          'Lead platform operations and incident response.',
        ]),
        requirements: expect.arrayContaining([
          'AWS expertise required.',
          'Kubernetes experience required.',
        ]),
        skills: expect.any(Array),
        sourceEvidence: expect.arrayContaining([
          'Lead platform operations and incident response.',
        ]),
      }),
    );
    expect(result.jobAnalysis.sourceEvidence.length).toBeGreaterThan(0);
    expect(result.fitScore).toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        verdict: expect.any(String),
        matchedSignals: expect.any(Array),
        gapSignals: expect.any(Array),
        sourceEvidence: expect.any(Array),
      }),
    );
    expect(result.fitScore.sourceEvidence.length).toBeGreaterThan(0);
  });

  it('persists canonical jobAnalysis and fitScore on fit assessment saves', async () => {
    const rawDescription = [
      'Responsibilities:',
      '- Lead platform operations and incident response.',
      'Requirements:',
      '- AWS expertise required.',
    ].join('\n');
    const persistedJobAnalysis = {
      jobText: 'persisted canonical job analysis',
      responsibilities: ['persisted responsibility'],
      requirements: ['persisted requirement'],
      skills: ['persisted skill'],
      sourceEvidence: ['persisted evidence'],
    };
    const persistedFitScore = {
      score: 77,
      verdict: 'Apply',
      matchedSignals: ['persisted matched signal'],
      gapSignals: ['persisted gap signal'],
      sourceEvidence: ['persisted fit evidence'],
    };

    jobRepository.findOne.mockResolvedValue({
      ...defaultJobRecord,
      rawDescription,
    });
    fitAssessmentRepository.save.mockResolvedValueOnce({
      id: 'fit-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'b-1',
      baselineVersion: 2,
      createdAt: new Date(),
      jobAnalysis: persistedJobAnalysis,
      fitScore: persistedFitScore,
    });

    const result = await service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-1',
      baselineVersion: 2,
    });

    expect(result.jobAnalysis).toBe(persistedJobAnalysis);
    expect(result.fitScore).toBe(persistedFitScore);
    expect(result.jobAnalysis).not.toEqual(
      expect.objectContaining({
        jobText: rawDescription,
      }),
    );
    expect(fitScoringServiceMock.score).not.toHaveBeenCalled();
    expect(fitAssessmentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        jobAnalysis: expect.objectContaining({
          jobText: rawDescription,
          responsibilities: expect.any(Array),
          requirements: expect.any(Array),
          skills: expect.any(Array),
          sourceEvidence: expect.any(Array),
        }),
        fitScore: expect.objectContaining({
          score: expect.any(Number),
          verdict: expect.any(String),
          matchedSignals: expect.any(Array),
          gapSignals: expect.any(Array),
          sourceEvidence: expect.any(Array),
        }),
      }),
    );
  });

  it('loads the canonical baseline for runFitAssessment without verifiedBaseline and scores once', async () => {
    const selectedJob = {
      ...defaultJobRecord,
      id: 'job-1',
      rawDescription:
        'Lead support operations and partner with engineering on incident response. Own queue health, tooling, and customer escalation workflows.',
      title: 'Director of Global Support',
      company: 'ExampleCo',
    };
    jobRepository.findOne.mockResolvedValue(selectedJob as Job);

    await service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-1',
      baselineVersion: 2,
    });

    expect(jobRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        userId: 'user-1',
      },
    });

    const queryBuilder = baselineRepository.createQueryBuilder.mock.results[0]?.value;
    expect(baselineRepository.createQueryBuilder).toHaveBeenCalledWith('baseline');
    expect(queryBuilder.select).toHaveBeenCalledWith(
      expect.arrayContaining([
        'baseline.id',
        'baseline.userId',
        'baseline.version',
        'baseline.versionNumber',
        'baseline.originalFilename',
        'baseline.mimeType',
        'baseline.storagePath',
        'baseline.hash',
        'baseline.status',
        'baseline.isActive',
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
      ]),
    );
    expect(
      (queryBuilder.select.mock.calls[0][0] as string[]).some((value) =>
        value.includes('verifiedBaseline'),
      ),
    ).toBe(false);
    expect(fitScoringServiceMock.scoreCxFitV2Authenticated).toHaveBeenCalledTimes(1);

    const scoringInput =
      (fitScoringServiceMock.scoreCxFitV2Authenticated as jest.Mock).mock.calls[0]?.[0];
    expect(scoringInput).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          baselineId: 'b-1',
        }),
      }),
    );
    expect(Array.isArray(scoringInput.baselineSections)).toBe(true);
    expect(scoringInput.baselineSections.length).toBeGreaterThan(0);
    expect(scoringInput.baselineSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: BaselineSectionType.SUMMARY,
          content: expect.stringContaining('Test'),
        }),
        expect.objectContaining({
          type: BaselineSectionType.EXPERIENCE,
          content: expect.stringContaining('ExampleCo'),
        }),
      ]),
    );
    expect(JSON.stringify(scoringInput.baselineSections)).toContain('Engineer');
    expect(JSON.stringify(scoringInput.baselineSections)).toContain('2020-01 to 2021-01');
    expect(JSON.stringify(scoringInput.baselineSections)).toContain('Led ops.');
    expect(scoringInput.job).toEqual(
      expect.objectContaining({
        rawDescription: selectedJob.rawDescription,
      }),
    );
    expect(scoringInput.jobTitle).toBe(selectedJob.title);
    expect(scoringInput.job.normalizedResponsibilities.length).toBeGreaterThan(0);
    expect(scoringInput.job.normalizedRequirements.length).toBeGreaterThanOrEqual(0);
  });

  it('blocks analysis.run when the latest Resume V2 is unusable even if fallback canonical baseline sections exist', async () => {
    baselineRepository.findOne.mockResolvedValue({
      ...baseline,
      parsedRecords: [
        {
          ...(baseline.parsedRecords?.[0] as any),
          id: 'parsed-1',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          resumeV2Json: {
            heading: { name: 'Test User', contactLine: 'test@example.com' },
            summary: '',
            skills: [],
            experience: [],
          },
        },
      ],
    });

    await expect(
      service.runFitAssessment('user-1', {
        baselineId: 'b-1',
        jobId: 'job-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: 'baseline_resume_v2_invalid',
        }),
      }),
    });
  });

  it('scores from canonical Resume V2 sections instead of polluted raw baseline sections when usable Resume V2 exists', async () => {
    baselineRepository.findOne.mockResolvedValueOnce({
      ...baseline,
      sections: [
        {
          id: 'raw-1',
          baselineId: 'b-1',
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Support Operations',
          content:
            'Contact: test@example.com | 555-123-4567\nTest User | Director of Engineering | ExampleCo | Remote\nSummary: polluted legacy text that should not be scored.',
          includePolicy: BaselineIncludePolicy.OPTIONAL,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as BaselineSection,
      ],
      parsedRecords: [
        {
          ...(baseline.parsedRecords?.[0] as any),
          id: 'parsed-usable-1',
          createdAt: new Date('2026-03-02T00:00:00.000Z'),
          resumeV2Json: {
            heading: { name: 'Test User', contactLine: 'test@example.com' },
            summary: 'Support operations leader',
            experience: [
              {
                company: 'ExampleCo',
                roleTitle: 'Engineer',
                startDate: '2020-01',
                endDate: '2021-01',
                bullets: ['Led ops.'],
              },
            ],
          },
        },
      ],
    } as any);

    const result = await service.scoreCompatibility('user-1', {
      baseline_version_id: 'bv-1',
      job: {
        raw_jd_text:
          'Lead support operations, incident response, and queue health for a scaling SaaS team.',
      },
    });

    expect(result.status).toBe('ok');
    expect(result.score).toEqual(expect.any(Number));

    const scoringInput = (scoreCxFitV2 as unknown as jest.Mock).mock.calls[0]?.[0];
    expect(scoringInput.baselineSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('Support operations leader'),
        }),
        expect.objectContaining({
          content: expect.stringContaining('ExampleCo'),
        }),
      ]),
    );
    expect(
      JSON.stringify(scoringInput.baselineSections),
    ).not.toContain('polluted legacy text');
    expect(
      JSON.stringify(scoringInput.baselineSections),
    ).not.toContain('Contact: test@example.com');
  });

  it.skip('reloads persisted jobAnalysis and fitScore from the saved fit assessment', async () => {
    const persistedJobAnalysis = {
      jobText: 'persisted canonical job analysis',
      responsibilities: ['persisted responsibility'],
      requirements: ['persisted requirement'],
      skills: ['persisted skill'],
      sourceEvidence: ['persisted evidence'],
    };
    const persistedFitScore = {
      score: 77,
      verdict: 'Apply',
      matchedSignals: ['persisted matched signal'],
      gapSignals: ['persisted gap signal'],
      sourceEvidence: ['persisted fit evidence'],
    };
    const savedAssessment = {
      id: 'fit-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'b-1',
      baselineVersion: 2,
      overallScore: 77,
      verdict: 'APPLY',
      dimensionScores: {
        experienceAlignment: 10,
        leadershipLevel: 10,
        technicalPlatformFit: 10,
        industryContext: 10,
        strategicTacticalFit: 10,
      },
      strengths: [],
      gaps: [],
      complianceFlags: [],
      scoringV2: null,
      jobAnalysis: persistedJobAnalysis,
      fitScore: persistedFitScore,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    fitAssessmentRepository.findOne.mockResolvedValue(savedAssessment);
    baselineVersionRepository.findOne.mockResolvedValue({
      ...baselineVersion,
      id: 'bv-1',
      baselineId: 'b-1',
      versionNumber: 2,
    });

    const result = await service.getFitAssessmentById('user-1', 'fit-1');

    expect(result.jobAnalysis).toBe(persistedJobAnalysis);
    expect(result.fitScore).toBe(persistedFitScore);
    expect(result.jobAnalysis?.jobText).toBe('persisted canonical job analysis');
  });

  it('does not trigger document generation below the fit threshold', async () => {
    fitAssessmentRepository.save.mockResolvedValueOnce({
      id: 'fit-low',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'b-1',
      baselineVersion: 2,
      overallScore: 90,
      verdict: 'APPLY',
      dimensionScores: {
        experienceAlignment: 10,
        leadershipLevel: 10,
        technicalPlatformFit: 10,
        industryContext: 10,
        strategicTacticalFit: 10,
      },
      strengths: [],
      gaps: [],
      complianceFlags: [],
      scoringV2: null,
      jobAnalysis: {
        jobText: 'persisted canonical job analysis',
        responsibilities: ['persisted responsibility'],
        requirements: ['persisted requirement'],
        skills: ['persisted skill'],
        sourceEvidence: ['persisted evidence'],
      },
      fitScore: {
        score: 69,
        verdict: 'consider',
        matchedSignals: [],
        gapSignals: [],
        sourceEvidence: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-1',
      baselineVersion: 2,
    });

    expect(resumeServiceMock.generateResume).not.toHaveBeenCalled();
    expect(coverLettersServiceMock.generateCoverLetter).not.toHaveBeenCalled();
  });

  it('does not invoke document generation during runFitAssessment when the persisted fit score qualifies', async () => {
    const richParsedJson = {
      baseline_id: '11111111-1111-4111-8111-111111111111',
      source_file_id: '11111111-1111-4111-8111-111111111112',
      source_format: 'pdf',
      ingested_at: new Date().toISOString(),
      schema_version: 'baseline_schema_v1',
      user_verified: true,
      identity: {
        full_name: 'Test User',
        summary: 'Seasoned support operations and platform leader',
        current_title: 'Director of Support Operations',
        current_company: 'ExampleCo',
        location: 'Remote',
      },
      experience: [
        {
          company: 'ExampleCo',
          role: 'Director of Support Operations',
          company_name: 'ExampleCo',
          role_title: 'Director of Support Operations',
          start_date: '2020-01',
          end_date: '2024-03',
          evidence: [{ id: 'e-1', text: 'Led support operations for a global SaaS team.', metrics: [], tags: [] }],
          details_text:
            'Led support operations for a global SaaS team.\nBuilt incident response runbooks and staffing workflows.\nPartnered cross-functionally to improve SLA adherence.',
        },
      ],
      education: [],
      skills: [{ name: 'ServiceNow', category: null }],
      people_leadership: {
        direct_reports: 12,
        managers_led: true,
        global_teams: true,
      },
      operational_ownership: {
        functions_owned: ['support operations', 'incident management'],
        process_design: true,
        process_scaling: true,
      },
      tooling_and_platforms: {
        tools: ['ServiceNow', 'Jira'],
        ownership_level: 'owned',
      },
      cross_functional_partnership: {
        product: true,
        engineering: true,
        sales_cs: true,
        executive: true,
      },
      customer_advocacy: {
        executive_escalations: true,
        voice_of_customer: true,
        post_incident_rca: true,
      },
      scale_and_scope: {
        customer_segment: 'enterprise',
        geo_scope: 'global',
        org_stage: 'growth',
      },
      metrics_and_outcomes: {
        metrics_present: true,
        metrics: ['Reduced MTTR by 25%'],
      },
      skills_and_tools: {
        tools: ['ServiceNow', 'Jira'],
        methodologies: ['ITIL'],
        domains: ['SaaS'],
      },
      system_generated_read_only: {
        missing_fields: [],
        ambiguity_flags: [],
        low_confidence_extractions: [],
      },
    };

    const sparseParsedRecord = {
      id: 'parsed-rich-1',
      baselineId: 'b-1',
      createdAt: new Date(),
      parsedJson: richParsedJson,
      resumeV2Json: {
        heading: { name: 'Test User', contactLine: 'test@example.com' },
        summary: 'Test',
        experience: [
          {
            company: 'ExampleCo',
            roleTitle: 'Support Operations Manager',
            startDate: '2021-01',
            endDate: '2021-12',
            bullets: ['Led ops.'],
          },
        ],
      },
      flagsJson: {
        reviewState: {
          verified: true,
        },
      },
    } as any;

    const richBaseline = {
      ...baseline,
      parsedRecords: [sparseParsedRecord],
      sections: baselineSections,
    } as any;
    baselineRepository.findOne.mockResolvedValue(richBaseline);
    baselineRepository.createQueryBuilder.mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(richBaseline),
    });
    studioArtifactRepositoryMock.findOne.mockResolvedValueOnce(null);
    fitAssessmentRepository.save.mockResolvedValueOnce({
      id: 'fit-high',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'b-1',
      baselineVersion: 2,
      overallScore: 90,
      verdict: 'APPLY',
      dimensionScores: {
        experienceAlignment: 10,
        leadershipLevel: 10,
        technicalPlatformFit: 10,
        industryContext: 10,
        strategicTacticalFit: 10,
      },
      strengths: [],
      gaps: [],
      complianceFlags: [],
      scoringV2: null,
      jobAnalysis: {
        jobText: 'persisted canonical job analysis',
        responsibilities: ['persisted responsibility'],
        requirements: ['persisted requirement'],
        skills: ['persisted skill'],
        sourceEvidence: ['persisted evidence'],
      },
      fitScore: {
        score: 90,
        verdict: 'apply',
        matchedSignals: [],
        gapSignals: [],
        sourceEvidence: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-1',
      baselineVersion: 2,
    });

    expect(resumeServiceMock.generateResume).not.toHaveBeenCalled();
    expect(coverLettersServiceMock.generateCoverLetter).not.toHaveBeenCalled();
    expect(studioArtifactRepositoryMock.findOne).not.toHaveBeenCalled();
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
    expect(result.verdict).toBe('Apply');
    expect(result.scoringProof?.assessmentId).toBe('fit-1');
    expect(result.scoringProof?.baselineTextCharsScored).toBeGreaterThan(0);
    expect(result.scoringProof?.jobTextCharsScored).toBeGreaterThan(0);
    expect(result.scoringProof).toMatchObject({
      normalizedResponsibilitiesCount: 1,
      normalizedRequirementsCount: 0,
      truncationAppliedBaseline: false,
      truncationAppliedJob: false,
    });
    const rawCharCount = jobRecord.rawDescription.trim().length;
    expect(result.scoringProof?.jobTextCharsScored).toBe(rawCharCount);
    expect(result.scoringProof?.jobTextSource).toBe('normalized');
    expect(result.scoringReliability).toBe('ok');
  });

  it('rehydrates scoring from parsedJson when resumeV2Json is sparse', async () => {
    const sparseResumeV2 = {
      heading: { name: 'Test User', contactLine: 'test@example.com' },
      summary: 'Test',
      experience: [
        {
          company: 'ExampleCo',
          roleTitle: 'Support Operations Manager',
          startDate: '2021-01',
          endDate: '2021-12',
          bullets: ['Led ops.'],
        },
      ],
    };

    const richParsedJson = {
      baseline_id: '11111111-1111-4111-8111-111111111111',
      source_file_id: '11111111-1111-4111-8111-111111111112',
      source_format: 'pdf',
      ingested_at: new Date().toISOString(),
      schema_version: 'baseline_schema_v1',
      user_verified: true,
      identity: {
        full_name: 'Test User',
        summary: 'Seasoned support operations and platform leader',
        current_title: 'Director of Support Operations',
        current_company: 'ExampleCo',
        location: 'Remote',
      },
      experience: [
        {
          company: 'ExampleCo',
          role: 'Director of Support Operations',
          company_name: 'ExampleCo',
          role_title: 'Director of Support Operations',
          start_date: '2020-01',
          end_date: '2024-03',
          evidence: [{ id: 'e-1', text: 'Led support operations for a global SaaS team.', metrics: [], tags: [] }],
          details_text:
            'Led support operations for a global SaaS team.\nBuilt incident response runbooks and staffing workflows.\nPartnered cross-functionally to improve SLA adherence.',
        },
        {
          company: 'ExampleCo',
          role: 'Support Operations Manager',
          company_name: 'ExampleCo',
          role_title: 'Support Operations Manager',
          start_date: '2018-01',
          end_date: '2020-01',
          evidence: [{ id: 'e-2', text: 'Scaled queue health and reporting.', metrics: [], tags: [] }],
          details_text:
            'Scaled queue health and reporting.\nAutomated recurring issue triage.\nSupported executive escalations and post-incident follow-up.',
        },
      ],
      education: [],
      skills: [{ name: 'ServiceNow', category: null }],
      people_leadership: {
        direct_reports: 12,
        managers_led: true,
        global_teams: true,
      },
      operational_ownership: {
        functions_owned: ['support operations', 'incident management'],
        process_design: true,
        process_scaling: true,
      },
      tooling_and_platforms: {
        tools: ['ServiceNow', 'Jira'],
        ownership_level: 'owned',
      },
      cross_functional_partnership: {
        product: true,
        engineering: true,
        sales_cs: true,
        executive: true,
      },
      customer_advocacy: {
        executive_escalations: true,
        voice_of_customer: true,
        post_incident_rca: true,
      },
      scale_and_scope: {
        customer_segment: 'enterprise',
        geo_scope: 'global',
        org_stage: 'growth',
      },
      metrics_and_outcomes: {
        metrics_present: true,
        metrics: ['Reduced MTTR by 25%'],
      },
      skills_and_tools: {
        tools: ['ServiceNow', 'Jira'],
        methodologies: ['ITIL'],
        domains: ['SaaS'],
      },
      system_generated_read_only: {
        missing_fields: [],
        ambiguity_flags: [],
        low_confidence_extractions: [],
      },
    };

    const sparseParsedRecord = {
      id: 'parsed-rich-1',
      baselineId: 'b-1',
      createdAt: new Date(),
      parsedJson: richParsedJson,
      resumeV2Json: sparseResumeV2,
      flagsJson: {
        reviewState: {
          verified: true,
        },
      },
    } as any;

    baselineVersionRepository.findOne.mockResolvedValueOnce({
      ...baselineVersion,
      baseline: {
        ...baseline,
        parsedRecords: [sparseParsedRecord],
      } as any,
    });
    baselineRepository.findOne.mockResolvedValueOnce({
      ...baseline,
      parsedRecords: [sparseParsedRecord],
      sections: baselineSections,
    });
    fitScoringServiceMock.scoreCxFitV2Authenticated.mockClear();

    const result = await service.scoreCompatibility('user-1', {
      baseline_version_id: 'bv-1',
      job: { raw_jd_text: 'Lead support operations and process rigor for a scaling SaaS team.' },
      debug: true,
    });

    expect(fitScoringServiceMock.scoreCxFitV2Authenticated).toHaveBeenCalled();
    const scorerInput = fitScoringServiceMock.scoreCxFitV2Authenticated.mock.calls[0][0];
    expect(Array.isArray(scorerInput.baselineSections)).toBe(true);
    expect(scorerInput.baselineSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: expect.any(String),
          content: expect.stringContaining('Director of Support Operations'),
        }),
      ]),
    );
    expect(result.scoringProof?.baselineTextCharsScored).toBeGreaterThan(332);
    expect(result.debug?.baselineSelectedSectionCount).toBeGreaterThan(0);
  });

  it('blocks analysis.run when Resume V2 is invalid even if fallback canonical baseline sections exist', async () => {
    // Force parsed canonical baseline JSON to exist but ResumeV2 to be unusable.
    baselineRepository.findOne.mockResolvedValue({
      ...baseline,
      sections: [
        {
          id: 's-1',
          baselineId: 'b-1',
          sectionType: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: 'Example Co | Program Manager | 2020-2024\n- Led ops.',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: 0,
        } as any,
      ],
      parsedRecords: [
        {
          id: 'parsed-1',
          baselineId: 'b-1',
          createdAt: new Date(),
          parsedJson: {
            schema_version: 'v1',
            source_format: 'pdf',
            ingested_at: new Date().toISOString(),
            system_generated_read_only: { missing_fields: [], ambiguity_flags: [], low_confidence_extractions: [] },
            experience: [{ company: 'Example', role: 'PM', company_name: 'Example', role_title: 'PM', start_date: null, end_date: null, evidence: [], details_text: 'Led ops.' }],
            skills_and_tools: { tools: [], domains: [], methodologies: [] },
          },
          resumeV2Json: { heading: { name: 'Test', contactLine: '' }, summary: 'Test', experience: [] },
        } as any,
      ],
    } as any);

    await expect(
      service.runFitAssessment('user-1', { baselineId: 'b-1', jobId: 'job-1' } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: 'baseline_resume_v2_invalid',
        }),
      }),
    });
  });

  it('flags scoring as unreliable when a non-empty job description yields zero extracted terms', async () => {
    const monicaJobRecord: Partial<Job> = {
      ...defaultJobRecord,
      rawDescription:
        'Equal opportunity employer. Benefits and compensation details. All qualified applicants will receive consideration.',
      normalizedResponsibilities: [],
      normalizedRequirements: [],
      jdIngestionMethod: JobIngestionMethod.PASTE,
    };
    jobRepository.findOne.mockResolvedValue(monicaJobRecord);

    fitScoringServiceMock.score.mockResolvedValueOnce({
      overallScore: 11,
      rawScore: 11,
      verdict: 'Skip',
      persistenceVerdict: FitAssessmentVerdict.SKIP,
      dimensionScores: {
        experienceAlignment: 10,
        leadershipLevel: 10,
        technicalPlatformFit: 10,
        industryContext: 10,
        strategicTacticalFit: 10,
      },
      strengths: [],
      gaps: [],
      summary: undefined,
      missingRequiredTools: [],
      missingRequiredToolsCount: 0,
      missingRequiredToolsPenalty: 0,
      leadershipOverrideApplied: false,
      complianceFlags: [],
    });

    (scoreCxFitV2 as unknown as jest.Mock).mockReturnValueOnce({
      ...sampleScoringV2,
      score: 11,
      scoreConfidence: 'low',
    } satisfies CxFitV2Result);

    const result = await service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-1',
      baselineVersion: 2,
    });

    expect(result.summary).toBe('No keywords found in the job description.');
    expect(result.scoringReliability).toBe('unreliable');
    expect(result.scoringReliabilityReason).toBe('job_description_terms_empty');
    expect(result.overallScore).toBe(11);
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
          parsedJson: {
            ...canonicalBaseline,
            baseline_id: '11111111-1111-4111-8111-111111111111',
            source_file_id: '22222222-2222-4222-8222-222222222222',
            source_format: 'pdf',
            ingested_at: '2026-04-01T00:00:00.000Z',
          },
          resumeV2Json: canonicalResumeV2,
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
    (baselineRepo as any).createQueryBuilder = jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(orderedBaseline),
    });
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
          resumeV2Json: canonicalResumeV2,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as BaselineParsed,
      ],
      sections: baselineSections,
    };
    baselineRepo.findOne
      .mockResolvedValueOnce(semanticBaseline)
      .mockResolvedValueOnce(semanticBaseline);
    (baselineRepo as any).createQueryBuilder = jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(semanticBaseline),
    });

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
    (baselineRepo as any).createQueryBuilder = jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(fallbackBaseline),
    });
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
      parsedJson: {
        ...canonicalBaseline,
        baseline_id: '11111111-1111-4111-8111-111111111111',
        source_file_id: '22222222-2222-4222-8222-222222222222',
        source_format: 'pdf',
        ingested_at: '2026-04-01T00:00:00.000Z',
      },
      resumeV2Json: canonicalResumeV2,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BaselineParsed;

    const baselineRepo = service['baselineRepository'] as { findOne: jest.Mock };
    baselineRepo.findOne.mockResolvedValueOnce({
      ...baseline,
      hash: null,
      parsedRecords: [parsedRecord],
    });
    (baselineRepo as any).createQueryBuilder = jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        ...baseline,
        hash: null,
        parsedRecords: [parsedRecord],
      }),
    });
    const baselineSectionRepo = service['baselineSectionRepository'] as {
      find: jest.Mock;
    };
    baselineSectionRepo.find.mockResolvedValue(baselineSections);

    const expectedHash = createHash('sha256')
      // buildBaselineFallbackHash hashes the validated/normalized canonical baseline (BaselineSchema.parse).
      .update(JSON.stringify(BaselineSchema.parse(parsedRecord.parsedJson)))
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
    jobRepository.findOne.mockResolvedValue(fallbackJob);

    const result = await service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-2',
      baselineVersion: 2,
    });

    expect(result.scoringProof?.jobTextSource).toBe('normalized');
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
        verdict: 'blocked',
        compliance: expect.objectContaining({
          blocked: true,
          message: 'Compliance validation failed.',
        }),
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
    const errorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined as any);

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
    ).rejects.toThrow(
      'Persisted assessment linkage does not match requested user/baseline',
    );

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not return success when assessment persistence fails', async () => {
    const errorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined as any);

    fitAssessmentRepository.save.mockRejectedValueOnce(new Error('db write failed'));

    await expect(
      service.runFitAssessment('user-1', {
        baselineId: 'b-1',
        jobId: 'job-1',
        baselineVersion: 2,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: 'analysis_run_unhandled_exception',
          failingFunction: 'AnalysisService.runFitAssessment',
        }),
      }),
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('db write failed'),
      expect.anything(),
    );
  });

  describe('runFitAssessment validation', () => {
    it('returns a detailed error when baselineId is missing', async () => {
      const errorSpy = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined as any);

      await expect(
        service.runFitAssessment('user-1', {
          baselineId: '',
          jobId: 'job-1',
        } as RunFitAssessmentDto),
      ).rejects.toMatchObject({
        response: { message: 'baselineId is required' },
      });

      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('returns a detailed error when jobId is missing', async () => {
      const errorSpy = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined as any);

      await expect(
        service.runFitAssessment('user-1', {
          baselineId: 'b-1',
          jobId: '',
        } as RunFitAssessmentDto),
      ).rejects.toMatchObject({
        response: { message: 'jobId is required' },
      });

      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('getCalibration schema drift compatibility', () => {
    it('falls back when betaAccessApproved column is missing', async () => {
      const warnSpy = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined as any);

      usersRepository.findOne.mockRejectedValueOnce(
        new Error('column User.betaAccessApproved does not exist'),
      );

      (usersRepository as any).createQueryBuilder = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'user-1',
          calibrationProfileName: null,
          calibrationWeights: null,
        }),
      });

      await expect(service.getCalibration('user-1')).resolves.toMatchObject({
        ok: true,
        profileName: expect.any(String),
        weights: expect.any(Object),
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing users.betaAccessApproved'),
      );
    });

    it('rethrows unrelated user lookup errors', async () => {
      const warnSpy = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined as any);

      usersRepository.findOne.mockRejectedValueOnce(new Error('db down'));

      await expect(service.getCalibration('user-1')).rejects.toThrow('db down');
      expect(warnSpy).not.toHaveBeenCalled();
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

    beforeEach(async () => {
      (scoreCxFitV2 as unknown as jest.Mock).mockClear();
      jobRepository.findOne.mockResolvedValue(refreshJobRecord);
      expectedHash = await service['computeExpectedInputsHashForJobBaseline'](
        'user-1',
        refreshJobRecord,
        baseline,
      );
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

    it('buildAnalysisDedupeKey includes the analysis cache fingerprint', () => {
      const dedupeKey = service['buildAnalysisDedupeKey']({
        userId: 'user-1',
        baselineId: 'b-1',
        jobId: 'job-1',
        inputsHash: 'inputs-hash-1',
      });

      const expected = createHash('sha256')
        .update(
          [
            'analysis.run',
            'user-1',
            'b-1',
            'job-1',
            'inputs-hash-1',
            ANALYSIS_RUN_CACHE_VERSION,
          ].join('|'),
        )
        .digest('hex');

      expect(dedupeKey).toBe(expected);
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
      scoringV2: {
        ...sampleScoringV2,
        score: 72,
      },
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
      expect(result.scoring_v2?.scorerVersion).toBe(CX_FIT_SCORER_VERSION);
      expect(scoreCxFitV2).not.toHaveBeenCalled();
    });

    it('recomputes a persisted assessment when the scorer version is missing', async () => {
      const legacyScoringV2 = {
        ...sampleScoringV2,
        score: 72,
      } as CxFitV2Result & { scorerVersion?: never };
      delete (legacyScoringV2 as { scorerVersion?: unknown }).scorerVersion;

      const staleAssessment: FitAssessment = {
        id: 'fit-missing-version',
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
        scoringV2: legacyScoringV2,
        inputsHash: expectedHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let savedAssessment: FitAssessment | null = null;
      fitAssessmentRepository.save.mockImplementation(async (payload) => {
        savedAssessment = {
          ...payload,
          id: 'fresh-fit-zero',
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

      fitAssessmentQueryBuilder.getOne.mockImplementation(() =>
        Promise.resolve(
          savedAssessment ?? {
            id: 'fresh-fit-zero',
            userId: 'user-1',
            jobId: 'job-1',
            baselineId: 'b-1',
            baselineVersion: baseline.version,
            overallScore: sampleScoringV2.score,
            verdict: FitAssessmentVerdict.APPLY,
            dimensionScores: {
              experienceAlignment: 90,
              leadershipLevel: 90,
              technicalPlatformFit: 90,
              industryContext: 90,
              strategicTacticalFit: 90,
            },
            strengths: ['leadership'],
            gaps: [],
            complianceFlags: [],
            confidenceScore: 86,
            confidenceReasons: [],
            scoringReliability: 'ok',
            scoringReliabilityReason: null,
            scoringV2: sampleScoringV2,
            jobAnalysis: null,
            fitScore: null,
            inputsHash: expectedHash,
            createdAt: new Date(),
          },
        ),
      );

      const result = await service.getLatestAssessmentForBaseline(
        'user-1',
        'job-1',
        'b-1',
      );

      expect(scoreCxFitV2).toHaveBeenCalled();
      expect(result.overallScore).toBe(sampleScoringV2.score);
      expect(result.fit_score).toBe(sampleScoringV2.score);
      expect(result.score).toBe(sampleScoringV2.score);
    });

    it('recomputes a persisted assessment without scoringV2 even when overallScore is zero', async () => {
      const staleAssessment: FitAssessment = {
        id: 'fit-no-v2-zero',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: baseline.version,
        overallScore: 0,
        verdict: FitAssessmentVerdict.CONSIDER,
        dimensionScores: {
          experienceAlignment: 0,
          leadershipLevel: 0,
          technicalPlatformFit: 0,
          industryContext: 0,
          strategicTacticalFit: 0,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        scoringV2: null,
        inputsHash: expectedHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let savedAssessment: FitAssessment | null = null;
      fitAssessmentRepository.save.mockImplementation(async (payload) => {
        savedAssessment = {
          ...payload,
          id: 'fresh-fit-no-v2-zero',
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

      expect(scoreCxFitV2).toHaveBeenCalled();
      expect(result.overallScore).toBe(sampleScoringV2.score);
      expect(result.score).toBe(sampleScoringV2.score);
      expect(result.scoring_v2?.scorerVersion).toBe(CX_FIT_SCORER_VERSION);
    });

    it('recomputes a persisted assessment without scoringV2 even when overallScore is nonzero', async () => {
      const staleAssessment: FitAssessment = {
        id: 'fit-no-v2-nonzero',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: baseline.version,
        overallScore: 41,
        verdict: FitAssessmentVerdict.CONSIDER,
        dimensionScores: {
          experienceAlignment: 41,
          leadershipLevel: 41,
          technicalPlatformFit: 41,
          industryContext: 41,
          strategicTacticalFit: 41,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        scoringV2: null,
        inputsHash: expectedHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let savedAssessment: FitAssessment | null = null;
      fitAssessmentRepository.save.mockImplementation(async (payload) => {
        savedAssessment = {
          ...payload,
          id: 'fresh-fit-no-v2-nonzero',
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

      expect(scoreCxFitV2).toHaveBeenCalled();
      expect(result.overallScore).toBe(sampleScoringV2.score);
      expect(result.fit_score).toBe(sampleScoringV2.score);
      expect(result.score).toBe(sampleScoringV2.score);
      expect(result.scoring_v2?.scorerVersion).toBe(CX_FIT_SCORER_VERSION);
    });

    it('recomputes a persisted assessment when scoringV2 exists but score is null', async () => {
      const staleAssessment: FitAssessment = {
        id: 'fit-null-score',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: baseline.version,
        overallScore: 84,
        verdict: FitAssessmentVerdict.APPLY,
        dimensionScores: {
          experienceAlignment: 84,
          leadershipLevel: 84,
          technicalPlatformFit: 84,
          industryContext: 84,
          strategicTacticalFit: 84,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        scoringV2: {
          ...sampleScoringV2,
          score: null,
        } as CxFitV2Result,
        inputsHash: expectedHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let savedAssessment: FitAssessment | null = null;
      fitAssessmentRepository.save.mockImplementation(async (payload) => {
        savedAssessment = {
          ...payload,
          id: 'fresh-fit-null-score',
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

      expect(scoreCxFitV2).toHaveBeenCalled();
      expect(result.overallScore).toBe(sampleScoringV2.score);
      expect(result.score).toBe(sampleScoringV2.score);
      expect(result.scoring_v2?.score).toBe(sampleScoringV2.score);
    });

    it('throws an explicit zero-score invariant failure when runFitAssessment returns 0 for non-empty inputs', async () => {
      (scoreCxFitV2 as unknown as jest.Mock).mockReturnValueOnce({
        ...sampleScoringV2,
        score: 0,
        rubric: {
          ...sampleScoringV2.rubric,
          resumeProject: {
            ...sampleScoringV2.rubric.resumeProject,
            totalScore: 0,
            finalScore: 0,
            categories: {
              experience_alignment: 0,
              leadership_level: 0,
              technical_and_platform_fit: 0,
              industry_and_context_fit: 0,
              strategic_vs_tactical_balance: 0,
            },
            categoryPoints: {
              experience_alignment: 0,
              leadership_level: 0,
              technical_and_platform_fit: 0,
              industry_and_context_fit: 0,
              strategic_vs_tactical_balance: 0,
            },
          },
          dimensionPercents: {
            ...sampleScoringV2.rubric.dimensionPercents,
          },
        },
      });

      await expect(
        service.runFitAssessment('user-1', {
          baselineId: 'b-1',
          jobId: 'job-1',
        }),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'cx_fit_zero_score_invariant_failed',
            details: {
              baselineId: 'b-1',
              jobId: 'job-1',
              baselineSectionCount: expect.any(Number),
              baselineTextLength: expect.any(Number),
              jobTextLength: expect.any(Number),
              scorerVersion: CX_FIT_SCORER_VERSION,
            },
          },
        },
      });

      expect(fitAssessmentRepository.save).not.toHaveBeenCalled();
    });

    it('uses the Resume rubric aggregate when runFitAssessment receives a zero legacy score with a nonzero nested rubric total', async () => {
      (fitScoringServiceMock.scoreCxFitV2Authenticated as jest.Mock).mockReturnValueOnce({
        ...sampleScoringV2,
        score: 0,
        rubric: {
          ...sampleScoringV2.rubric,
          resumeProject: {
            ...sampleScoringV2.rubric.resumeProject,
            totalScore: 0,
            finalScore: 0,
            categories: {
              experience_alignment: 0,
              leadership_level: 0,
              technical_and_platform_fit: 0,
              industry_and_context_fit: 0,
              strategic_vs_tactical_balance: 0,
            },
            categoryPoints: {
              experience_alignment: 30,
              leadership_level: 20,
              technical_and_platform_fit: 20,
              industry_and_context_fit: 15,
              strategic_vs_tactical_balance: 5,
            },
          },
        },
      });

      const result = await service.runFitAssessment('user-1', {
        baselineId: 'b-1',
        jobId: 'job-1',
      });

      expect(result.score).toBe(90);
      expect(result.overallScore).toBe(90);
      expect(result.scoring_v2?.score).toBe(90);
      expect(result.scoring_v2?.rubric.resumeProject.totalScore).toBe(90);
      expect(
        Object.values(result.breakdown).reduce((sum, value) => sum + value, 0),
      ).toBe(90);
      expect(fitAssessmentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          overallScore: 90,
        }),
      );
    });

    it('aligns the Resume rubric score from categoryPoints array data when the top-level score is zero', () => {
      const scoringV2 = {
        ...sampleScoringV2,
        score: 0,
        rubric: {
          ...sampleScoringV2.rubric,
          resumeProject: {
            ...sampleScoringV2.rubric.resumeProject,
            totalScore: 0,
            finalScore: 0,
            categories: [
              { category: 'experience_alignment', points: 0 },
              { category: 'leadership_level', points: 0 },
              { category: 'technical_and_platform_fit', points: 0 },
              { category: 'industry_and_context_fit', points: 0 },
              { category: 'strategic_vs_tactical_balance', points: 0 },
            ] as unknown as CxFitV2Result['rubric']['resumeProject']['categories'],
            categoryPoints: [
              { category: 'experience_alignment', points: 30 },
              { category: 'leadership_level', points: 20 },
              { category: 'technical_and_platform_fit', points: 20 },
              { category: 'industry_and_context_fit', points: 15 },
              { category: 'strategic_vs_tactical_balance', points: 5 },
            ] as unknown as CxFitV2Result['rubric']['resumeProject']['categoryPoints'],
          },
        },
      } as CxFitV2Result & { scorerVersion?: string };
      delete scoringV2.scorerVersion;

      const aligned = (service as unknown as {
        alignCxFitScoreToResumeProject: (value: CxFitV2Result) => CxFitV2Result | null;
      }).alignCxFitScoreToResumeProject(scoringV2);

      expect(aligned?.score).toBe(90);
      expect(aligned?.scorerVersion).toBe(CX_FIT_SCORER_VERSION);
      expect(aligned?.rubric.resumeProject.totalScore).toBe(90);
      expect(aligned?.rubric.resumeProject.finalScore).toBe(90);
    });

    it('throws an explicit zero-score invariant failure for reused latest assessments with non-empty baseline and job text', async () => {
      const zeroScoringV2: CxFitV2Result = {
        ...sampleScoringV2,
        score: 0,
        rubric: {
          ...sampleScoringV2.rubric,
          resumeProject: {
            ...sampleScoringV2.rubric.resumeProject,
            totalScore: 0,
            finalScore: 0,
            categories: {
              experience_alignment: 0,
              leadership_level: 0,
              technical_and_platform_fit: 0,
              industry_and_context_fit: 0,
              strategic_vs_tactical_balance: 0,
            },
            categoryPoints: {
              experience_alignment: 0,
              leadership_level: 0,
              technical_and_platform_fit: 0,
              industry_and_context_fit: 0,
              strategic_vs_tactical_balance: 0,
            },
          },
          dimensionPercents: {
            ...sampleScoringV2.rubric.dimensionPercents,
          },
        },
      };
      const staleAssessment: FitAssessment = {
        id: 'fit-zero',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: baseline.version,
        overallScore: 0,
        verdict: FitAssessmentVerdict.CONSIDER,
        dimensionScores: {
          experienceAlignment: 0,
          leadershipLevel: 0,
          technicalPlatformFit: 0,
          industryContext: 0,
          strategicTacticalFit: 0,
        },
        strengths: [],
        gaps: [],
        complianceFlags: [],
        scoringV2: zeroScoringV2,
        inputsHash: expectedHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      fitAssessmentRepository.findOne.mockImplementation(({ where }) => {
        if (where?.id) {
          return Promise.resolve(staleAssessment);
        }
        return Promise.resolve(staleAssessment);
      });

      await expect(
        service.getLatestAssessmentForBaseline('user-1', 'job-1', 'b-1'),
      ).rejects.toMatchObject({
        response: {
          error: {
            code: 'cx_fit_zero_score_invariant_failed',
            details: {
              baselineId: 'b-1',
              jobId: 'job-1',
              baselineSectionCount: expect.any(Number),
              baselineTextLength: expect.any(Number),
              jobTextLength: expect.any(Number),
              scorerVersion: CX_FIT_SCORER_VERSION,
            },
          },
        },
      });

      expect(scoreCxFitV2).not.toHaveBeenCalled();
    });

    it.skip('recomputes when the stored inputs hash is stale', async () => {
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

      expect(scoreCxFitV2).toHaveBeenCalled();
      expect(savedAssessment).not.toBeNull();
      expect(savedAssessment?.inputsHash).toBe(expectedHash);
      expect(result.overallScore).toBe(sampleScoringV2.score);
    });

    it('recomputes a persisted assessment when the scorer version is stale', async () => {
      const staleScoringV2 = {
        ...sampleScoringV2,
        score: 73,
        scorerVersion: '2026-01-01-cx-fit-scoring-v1',
      } as CxFitV2Result;

      const legacyAssessment: FitAssessment = {
        id: 'fit-legacy',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'b-1',
        baselineVersion: baseline.version,
        overallScore: 73,
        verdict: FitAssessmentVerdict.APPLY,
        dimensionScores: {
          experienceAlignment: 71,
          leadershipLevel: 71,
          technicalPlatformFit: 71,
          industryContext: 71,
          strategicTacticalFit: 71,
        },
        strengths: ['leadership'],
        gaps: ['detail'],
        complianceFlags: [],
        scoringV2: staleScoringV2,
        inputsHash: expectedHash,
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

      expect(scoreCxFitV2).toHaveBeenCalled();
      expect(savedAssessment?.inputsHash).toBe(expectedHash);
      expect(result.overallScore).toBe(sampleScoringV2.score);
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
