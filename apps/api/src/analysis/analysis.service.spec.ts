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
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { User } from '../users/user.entity';
import { Interview } from '../interviews/interview.entity';
import { ExpandedFitAssessment } from './expanded-fit-assessment.entity';
import { AnalysisService } from './analysis.service';
import { FitAssessment, FitAssessmentVerdict } from './fit-assessment.entity';
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

  const defaultJobRecord: Partial<Job> = {
    id: 'job-1',
    userId: 'user-1',
    rawDescription: 'Lead operations with AWS focus.',
    normalizedResponsibilities: ['Lead operations'],
    normalizedRequirements: ['AWS expertise'],
    jdIngestionMethod: JobIngestionMethod.PASTE,
    title: 'Cloud Lead',
    company: 'ExampleCo',
    sourceUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    baselineVersionRepository = { findOne: jest.fn().mockResolvedValue(baselineVersion) };
    jobRepository = { findOne: jest.fn().mockResolvedValue(defaultJobRecord) };
    fitScoringServiceMock = {
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
            normalizeSectionsForOutput: jest.fn().mockImplementation((sections) => sections),
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
        { provide: getRepositoryToken(Job), useValue: jobRepository },
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
    expect(result.audit_id).toBe('audit-1');
    expect(result.auditId).toBe('audit-1');
    expect(result.baseline_version_hash).toBe('hash');
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
      normalizedResponsibilities: ['Lead operations'],
      normalizedRequirements: ['AWS expertise'],
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
      normalizedResponsibilitiesCount: 1,
      normalizedRequirementsCount: 1,
      truncationAppliedBaseline: false,
      truncationAppliedJob: false,
    });
    const rawCharCount = jobRecord.rawDescription.trim().length;
    expect(result.scoringProof?.jobTextCharsScored).toBe(rawCharCount);
    expect(result.scoringProof?.jobTextSource).toBe('raw');
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

  describe('latest assessment refresh', () => {
    const refreshJobRecord: Job = {
      id: 'job-1',
      userId: 'user-1',
      rawDescription: '  Lead enterprise programs with narrative clarity.  ',
      normalizedResponsibilities: ['Lead teams'],
      normalizedRequirements: ['Executive-level experience'],
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
      jobRepository.findOne.mockResolvedValue(refreshJobRecord);
      expectedHash = await service['computeExpectedInputsHashForJobBaseline'](
        'user-1',
        refreshJobRecord,
        baseline,
      );
    });

    it('buildInputsHash ignores normalized segments when raw description exists', () => {
      const filteredSections = service['getIncludedSections'](baseline.sections);
      const sectionPayload = service['buildSectionPayload'](filteredSections);
      const { canonicalJobForHash: canonicalWith } = service['buildCanonicalJobAssets']({
        rawDescription: refreshJobRecord.rawDescription,
        normalizedResponsibilities: refreshJobRecord.normalizedResponsibilities,
        normalizedRequirements: refreshJobRecord.normalizedRequirements,
        title: refreshJobRecord.title,
        company: refreshJobRecord.company,
        sourceUrl: refreshJobRecord.sourceUrl,
      });
      const { canonicalJobForHash: canonicalWithout } = service['buildCanonicalJobAssets']({
        rawDescription: refreshJobRecord.rawDescription,
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
        inputsHash: expectedHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      fitAssessmentRepository.findOne.mockResolvedValue(storedAssessment);

      const result = await service.getLatestAssessmentForBaseline('user-1', 'job-1', 'b-1');

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
        inputsHash: 'stale-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let savedAssessment: FitAssessment | null = null;

      fitAssessmentRepository.save.mockImplementation(async (payload) => {
        savedAssessment = { ...payload, id: 'fresh-fit', createdAt: new Date() } as FitAssessment;
        return savedAssessment;
      });

      fitAssessmentRepository.findOne.mockImplementation(({ where }) => {
        if (where?.id) {
          return Promise.resolve(savedAssessment);
        }
        return Promise.resolve(staleAssessment);
      });

      const result = await service.getLatestAssessmentForBaseline('user-1', 'job-1', 'b-1');

      expect(fitScoringServiceMock.score).toHaveBeenCalled();
      expect(savedAssessment).not.toBeNull();
      expect(savedAssessment?.inputsHash).toBe(expectedHash);
      expect(result.assessmentId).toBe(savedAssessment?.id);
    });
  });
});
