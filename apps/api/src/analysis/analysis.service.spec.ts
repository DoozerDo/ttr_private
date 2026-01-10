import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
} from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { ComplianceAction } from '../compliance/compliance.types';
import { ComplianceService } from '../compliance/compliance.service';
import { Job } from '../jobs/job.entity';
import { User } from '../users/user.entity';
import { Interview } from '../interviews/interview.entity';
import { ExpandedFitAssessment } from './expanded-fit-assessment.entity';
import { AnalysisService } from './analysis.service';
import { FitAssessment } from './fit-assessment.entity';
import { FitScoringService } from './fit-scoring.service';

describe('AnalysisService - fit scores contract', () => {
  let service: AnalysisService;
  let complianceService: ComplianceService;
  let baselineVersionRepository: { findOne: jest.Mock };
  let fitAssessmentRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };

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
      content: 'Implemented distributed systems and led platform teams.',
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
      content: 'AWS, Kubernetes, Terraform',
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

  beforeEach(async () => {
    baselineVersionRepository = { findOne: jest.fn().mockResolvedValue(baselineVersion) };

    const module = await Test.createTestingModule({
      providers: [
        AnalysisService,
        FitScoringService,
        {
          provide: ComplianceService,
          useValue: {
            validateAndAudit: jest.fn().mockResolvedValue({
              complianceFlags: [],
              blocked: false,
              audit: { id: 'audit-1' },
            }),
          },
        },
        { provide: getRepositoryToken(Baseline), useValue: { findOne: jest.fn().mockResolvedValue(baseline) } },
        {
          provide: getRepositoryToken(BaselineSection),
          useValue: { find: jest.fn().mockResolvedValue(baselineSections) },
        },
        {
          provide: getRepositoryToken(BaselineBlockPolicy),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        { provide: getRepositoryToken(BaselineVersion), useValue: baselineVersionRepository },
        { provide: getRepositoryToken(Job), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Interview), useValue: { findOne: jest.fn() } },
        {
          provide: getRepositoryToken(FitAssessment),
          useValue: (() => {
            fitAssessmentRepository = {
              create: jest.fn((payload) => payload),
              save: jest.fn(async (payload) => ({ ...payload, id: 'fit-1', createdAt: new Date() })),
              findOne: jest.fn(),
            };
            
            return fitAssessmentRepository;
          })(),
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
      ],
    }).compile();

    service = module.get(AnalysisService);
    complianceService = module.get(ComplianceService);
  });

  it('returns the baseline version id for the latest assessment', async () => {
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
      createdAt: new Date(),
    });

    const result = await service.getLatestAssessment('user-1', 'job-1');

    expect(result.baselineVersionId).toBe('bv-1');
    expect(baselineVersionRepository.findOne).toHaveBeenCalledWith({
      where: { baselineId: 'b-1', versionNumber: 2 },
      order: { createdAt: 'DESC' },
    });
  });

  it('rejects ambiguous JD inputs', async () => {
    await expect(
      service.scoreCompatibility('user-1', {
        baseline_version_id: 'bv-1',
        job: { raw_jd_text: 'text', parsed_jd: { requirements: ['x'] } },
      }),
    ).rejects.toThrowError(expect.objectContaining({ response: expect.objectContaining({ error: expect.objectContaining({ code: 'JD_INPUT_AMBIGUOUS' }) }) }));
  });

  it('rejects missing JD inputs', async () => {
    await expect(
      service.scoreCompatibility('user-1', { baseline_version_id: 'bv-1', job: {} }),
    ).rejects.toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({ error: expect.objectContaining({ code: 'JD_INPUT_MISSING' }) }),
      }),
    );
  });

  it('returns a contract-compliant success response', async () => {
    const result = await service.scoreCompatibility('user-1', {
      baseline_version_id: 'bv-1',
      job: { raw_jd_text: 'Lead cloud platforms with AWS and Kubernetes expertise.' },
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
        components: expect.objectContaining({
          scope: expect.any(Number),
          leadership: expect.any(Number),
        }),
        adjustments: expect.objectContaining({
          selfSimilarityApplied: expect.any(Boolean),
        }),
      }),
    );
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
});
