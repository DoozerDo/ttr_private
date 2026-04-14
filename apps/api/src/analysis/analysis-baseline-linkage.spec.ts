import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Baseline } from '../baseline/baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceAction } from '../compliance/compliance.types';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { User } from '../users/user.entity';
import { Interview } from '../interviews/interview.entity';
import { ExpandedFitAssessment } from './expanded-fit-assessment.entity';
import { AnalysisService } from './analysis.service';
import { FitAssessment, FitAssessmentVerdict } from './fit-assessment.entity';
import { FitScoringService } from './fit-scoring.service';
import { GapAnalysisService } from './gap-analysis.service';
import { selectBaselineTextForScoring } from './baseline-selection';
import { WorkflowIdempotencyService } from '../common/workflow-idempotency.service';

jest.mock('./baseline-selection', () => ({
  selectBaselineTextForScoring: jest.fn(),
}));

describe('AnalysisService baseline linkage', () => {
  const mockedSelectBaselineTextForScoring = selectBaselineTextForScoring as jest.Mock;

  let service: AnalysisService;
  let baselineRepository: { findOne: jest.Mock; update: jest.Mock };
  let baselineSectionRepository: { find: jest.Mock };
  let fitAssessmentRepository: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let jobRepository: { findOne: jest.Mock };

  const baselineSections: BaselineSection[] = [
    {
      id: 's-1',
      baselineId: 'b-1',
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Support Operations Leadership',
      content:
        'Led support operations programs for a SaaS product team, improving SLA adherence, reducing repeat escalations, and building a steadier operating rhythm for frontline managers.',
      includePolicy: BaselineIncludePolicy.OPTIONAL,
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as BaselineSection,
    {
      id: 's-2',
      baselineId: 'b-1',
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Workflow And Incident Design',
      content:
        'Built intake, triage, and escalation workflows that clarified ownership across support, product, and engineering.',
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

  const job: Partial<Job> = {
    id: 'job-1',
    userId: 'user-1',
    rawDescription:
      'Lead support operations, incident response, process architecture, and cross-functional execution for a scaling SaaS team. Own queue health and service quality.',
    normalizedResponsibilities: [],
    normalizedRequirements: [],
    jdIngestionMethod: JobIngestionMethod.PASTE,
    title: 'Support Operations Director',
    company: 'ExampleCo',
    sourceUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    baselineRepository = {
      findOne: jest.fn().mockResolvedValue(baseline),
      update: jest.fn().mockResolvedValue(undefined),
    };
    baselineSectionRepository = {
      find: jest.fn().mockResolvedValue(baselineSections),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          sectionCount: '2',
          totalChars: '640',
        }),
      }),
    };
    fitAssessmentRepository = {
      create: jest.fn((payload) => payload),
      save: jest.fn(async (payload) => ({
        ...payload,
        id: 'fit-1',
        createdAt: new Date('2026-04-08T23:57:52.649Z'),
      })),
      findOne: jest.fn(),
    };
    jobRepository = {
      findOne: jest.fn().mockResolvedValue(job),
    };

    const module = await Test.createTestingModule({
      providers: [
        AnalysisService,
        {
          provide: FitScoringService,
          useValue: {
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
          },
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
            normalizeSectionsForOutput: jest.fn().mockImplementation((sections) => sections),
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
            validateRequirements: jest.fn().mockReturnValue([]),
          },
        },
        {
          provide: getRepositoryToken(Baseline),
          useValue: baselineRepository,
        },
        {
          provide: getRepositoryToken(BaselineSection),
          useValue: baselineSectionRepository,
        },
        {
          provide: getRepositoryToken(BaselineBlockPolicy),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(BaselineVersion),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 'bv-1',
              baselineId: 'b-1',
              versionNumber: 2,
            }),
          },
        },
        { provide: getRepositoryToken(Job), useValue: jobRepository },
        {
          provide: getRepositoryToken(Interview),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(FitAssessment),
          useValue: fitAssessmentRepository,
        },
        {
          provide: getRepositoryToken(ExpandedFitAssessment),
          useValue: {
            create: jest.fn((payload) => payload),
            save: jest.fn(async (payload) => ({ ...payload, id: 'exp-1', createdAt: new Date() })),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 'user-1',
              calibrationProfileName: null,
              calibrationWeights: null,
            }),
          },
        },
        {
          provide: WorkflowIdempotencyService,
          useValue: {
            reserve: jest.fn().mockResolvedValue({
              status: 'accepted_new',
              runId: 'run-1',
              dedupeKey: 'dedupe-1',
              recordId: 'record-1',
            }),
            complete: jest.fn().mockResolvedValue({
              status: 'completed',
              recordId: 'record-1',
            }),
          },
        },
      ],
    }).compile();

    service = module.get(AnalysisService);

    mockedSelectBaselineTextForScoring.mockReturnValue({
      normalizedBaselineText:
        'support operations leadership workflow and incident design cross functional execution queue health service quality escalation triage ownership improvement '.repeat(8),
      sectionsForScoring: baselineSections,
      includedBaselineChars: 640,
      originalBaselineChars: 640,
      selectedSectionIds: ['s-1', 's-2'],
      selectedSections: baselineSections,
      source: 'sections',
      selectedSectionCount: 2,
      normalizedBaselineTextSource: 'sections',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('persists latestAssessmentId on the baseline and returns it in the analysis response', async () => {
    const result = await service.runFitAssessment('user-1', {
      baselineId: 'b-1',
      jobId: 'job-1',
      baselineVersion: 2,
    });

    expect(baselineRepository.update).toHaveBeenCalledWith(
      { id: 'b-1', userId: 'user-1' },
      expect.objectContaining({
        latestAssessmentId: 'fit-1',
        latestBaselineScore: expect.any(Number),
        lastAnalyzedAt: expect.any(Date),
      }),
    );
    expect(result.assessmentId).toBe('fit-1');
    expect(result.latestAssessmentSummary?.latestAssessmentId).toBe('fit-1');
    expect(result.latestAssessmentSummary?.hasCompletedAssessment).toBe(true);
  });
});
