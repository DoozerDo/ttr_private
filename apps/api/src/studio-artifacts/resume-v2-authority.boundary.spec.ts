import { StudioArtifactsService } from './studio-artifacts.service';
import { ResumeService } from '../resume/resume.service';
import { CoverLettersService } from '../cover-letters/cover-letters.service';
import { RESUME_GENERATION_V2_FEATURE_FLAG } from '../resume/resume-generation-v2';
import {
  RESUME_V2_AUTHORITY_IMPOSSIBLE_MARKER,
  buildCandidateSafeResumeV2Fixture,
  buildPoisonedBaselineSections,
} from '../__test-utils__/resume-v2-authority.fixture';

function createRepository<T extends object>(initial?: Partial<T> | null) {
  let stored: Partial<T> | null = initial ?? null;
  return {
    findOne: jest.fn(async () => stored),
    find: jest.fn(async () => (stored ? [stored] : [])),
    create: jest.fn((payload: Partial<T>) => ({ ...payload } as Partial<T>)),
    save: jest.fn(async (payload: Partial<T>) => {
      stored = { ...(stored ?? {}), ...payload };
      return stored as T;
    }),
  };
}

describe('Persisted resume generation authority boundary (regression guardrail)', () => {
  const baselineId = 'baseline-1';
  const baselineVersionId = 'baseline-version-1';
  const jobId = 'job-1';
  const analysisId = 'analysis-1';

  it('uses persisted ResumeV2 only; never reads baseline sections as generation source material', async () => {
    const originalFlag = process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
    process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = 'true';

    const resumeV2Json = buildCandidateSafeResumeV2Fixture();
    const poisonedSections = [
      // Provide extractable experience identity so ResumeV2 generation can satisfy the authoritative experience gate,
      // while still ensuring baseline sections are not used as resumeText authority material in ResumeV2 mode.
      {
        id: 'section-exp',
        title: 'Experience',
        sectionType: 'EXPERIENCE',
        content: [
          'Director of Support – Acme',
          'Remote 2020 - 2024',
          '- Led support operations and improved incident response quality through repeatable playbooks.',
        ].join('\n'),
      },
      // Poison a non-experience section with the marker; it must never appear in interpreted resumeText authority.
      {
        id: 'section-poison',
        title: 'Summary',
        sectionType: 'SUMMARY',
        content: `This baseline section is poisoned: ${RESUME_V2_AUTHORITY_IMPOSSIBLE_MARKER}`,
      },
    ];

    const baseline = {
      id: baselineId,
      userId: 'user-1',
      sections: poisonedSections,
      parsedRecords: [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          resumeV2Json,
          parsedJson: { identity: { full_name: 'Alex Candidate' } },
        },
      ],
    };

    const baselineVersion = { id: baselineVersionId, baselineId, hash: 'baseline-hash-1', versionNumber: 1 };
    const job = {
      id: jobId,
      userId: 'user-1',
      title: 'Program Manager',
      company: 'Example Co',
      normalizedResponsibilities: ['Drive operational execution'],
      normalizedRequirements: ['Deliver measurable outcomes'],
    };
    const assessment = { id: analysisId, userId: 'user-1', jobId, baselineId, overallScore: 88, baselineVersion: 1 };

    const baselineRepository = { findOne: jest.fn(async () => baseline) };
    const baselineVersionRepository = { findOne: jest.fn(async () => baselineVersion) };
    const jobRepository = { findOne: jest.fn(async () => job) };
    const assessmentRepository = { findOne: jest.fn(async () => assessment) };

    const studioArtifactRepository = createRepository<any>(null);

    const backfillService = {
      backfillLatestIfMissing: jest.fn(async () => null),
    };

    const interpreterModule = require('../evidence/evidence-interpreter');
    const interpretSpy = jest.spyOn(interpreterModule, 'interpretEvidenceFromResumeText');

    const studioArtifactsService = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
      { generateResume: jest.fn() } as any,
      { generateCoverLetter: jest.fn() } as any,
    );

    const resumeArtifactsService = {
      computeJobFingerprint: jest.fn().mockReturnValue('job-fingerprint-1'),
      computeResumeInputsHash: jest.fn().mockReturnValue('resume-inputs-hash-1'),
      recordResumeInProgress: jest.fn().mockResolvedValue('studio-artifact-1'),
      recordResumeSuccess: jest.fn().mockResolvedValue('studio-artifact-1'),
      recordResumeFailure: jest.fn().mockResolvedValue('studio-artifact-1'),
    } as any;

    const coverArtifactsService = {
      computeJobFingerprint: jest.fn().mockReturnValue('job-fingerprint-1'),
      computeCoverLetterInputsHash: jest.fn().mockReturnValue('cover-inputs-hash-1'),
      recordCoverLetterInProgress: jest.fn().mockResolvedValue('studio-artifact-1'),
      recordCoverLetterSuccess: jest.fn().mockResolvedValue('studio-artifact-1'),
      recordCoverLetterFailure: jest.fn().mockResolvedValue('studio-artifact-1'),
    } as any;

    const workflowIdempotencyService = {
      reserve: jest.fn().mockResolvedValue({ status: 'accepted_new', runId: 'run-1', responseBody: null }),
      complete: jest.fn().mockResolvedValue({ status: 'completed' }),
      markFailure: jest.fn().mockResolvedValue(undefined),
    } as any;

    const complianceService = {
      normalizeText: jest.fn((value: string) => value),
      enforceResumeWritingRules: jest.fn().mockReturnValue([]),
      detectScopeInflation: jest.fn().mockResolvedValue([]),
      validateAndAudit: jest.fn().mockResolvedValue({
        complianceFlags: [],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1', action: 'generation' },
      }),
      normalizeSectionsForOutput: jest.fn().mockImplementation((sections) => sections),
    } as any;

    const gapAnalysisService = { analyze: jest.fn().mockReturnValue({ strengths: [], criticalGaps: [] }) } as any;
    const applicationsService = { upsertApplicationForPair: jest.fn().mockResolvedValue({ id: 'app-1' }) } as any;
    const opportunitiesService = { upsertOpportunityForPair: jest.fn().mockResolvedValue({ id: 'opp-1' }) } as any;
    const criticalFlowTrackerService = {
      recordCriticalFlowEvent: jest.fn().mockResolvedValue({ id: 'tracker-1' }),
    } as any;

    const resumeService = new ResumeService(
      baselineRepository as any,
      baselineVersionRepository as any,
      createRepository<any>([]) as any,
      jobRepository as any,
      assessmentRepository as any,
      complianceService,
      applicationsService,
      opportunitiesService,
      gapAnalysisService,
      criticalFlowTrackerService,
      workflowIdempotencyService,
      studioArtifactsService as any,
      backfillService as any,
    );

    const dataSource = {
      getRepository: jest.fn((entity) => {
        const entityName = String(entity?.name ?? entity ?? '');
        if (entityName.includes('CoverLetter')) return createRepository<any>(null);
        if (entityName.includes('BaselineBlockPolicy')) return createRepository<any>([]);
        if (entityName.includes('BaselineVersion')) return baselineVersionRepository;
        if (entityName.includes('Baseline')) return baselineRepository;
        if (entityName.includes('Job')) return jobRepository;
        if (entityName.includes('FitAssessment')) return assessmentRepository;
        return createRepository<any>(null);
      }),
    } as any;

    const coverLettersService = new CoverLettersService(
      dataSource,
      complianceService,
      gapAnalysisService,
      workflowIdempotencyService,
      coverArtifactsService,
      applicationsService,
      backfillService as any,
    );

    const coverGeneratorSpy = jest.spyOn((coverLettersService as any).generator, 'generate');

    try {
      await studioArtifactsService.readState({
        userId: 'user-1',
        baselineId,
        jobId,
        baselineVersionId,
        analysisId,
      } as any);

      expect(interpretSpy).toHaveBeenCalled();
      const studioInterpretArg = interpretSpy.mock.calls[0]?.[0] as any;
      expect(String(studioInterpretArg?.resumeText ?? '')).not.toContain(RESUME_V2_AUTHORITY_IMPOSSIBLE_MARKER);
      expect(String(studioInterpretArg?.resumeText ?? '')).toMatch(/Alex Candidate/i);

      const resumeResult = await resumeService.generateResume(
        'user-1',
        {
          baselineId,
          baselineVersionId,
          jobId,
          analysisId,
          forceRegenerate: true,
          oneTap: true,
        } as any,
        { skipReadinessGate: true } as any,
      );
      const resumeText = String((resumeResult as any).content ?? '') + '\n' + String((resumeResult as any).preview?.resume?.content ?? '');
      expect(resumeText).not.toContain(RESUME_V2_AUTHORITY_IMPOSSIBLE_MARKER);
      expect(resumeText).toMatch(/Director of Support/i);
      expect(resumeText).toMatch(/repeatable playbooks/i);

      const coverResult = await coverLettersService.generateCoverLetter('user-1', {
        baselineId,
        baselineVersionId,
        jobId,
        analysisId,
      } as any);
      const coverText = String((coverResult as any).content ?? '');
      expect(coverText).not.toContain(RESUME_V2_AUTHORITY_IMPOSSIBLE_MARKER);
      expect(coverText).toMatch(/repeatable playbooks/i);

      expect(coverGeneratorSpy).toHaveBeenCalled();
      const coverInput = coverGeneratorSpy.mock.calls[0]?.[0] as any;
      const coverAuthority = String(
        (coverInput?.allowedBaselineBlocks ?? []).map((b: any) => b?.content ?? '').join('\n'),
      );
      expect(coverAuthority).not.toContain(RESUME_V2_AUTHORITY_IMPOSSIBLE_MARKER);
      expect(coverAuthority).toMatch(/Alex Candidate/i);
    } finally {
      coverGeneratorSpy.mockRestore();
      interpretSpy.mockRestore();
      if (originalFlag === undefined) delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
      else process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
    }
  });
});
