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
    createQueryBuilder: jest.fn(() => {
      const builder: any = {
        insert: () => builder,
        into: () => builder,
        values: jest.fn((payload: Partial<T>) => {
          stored = { ...(stored ?? {}), ...payload };
          return builder;
        }),
        onConflict: () => builder,
        returning: () => builder,
        update: () => builder,
        set: jest.fn((payload: Partial<T>) => {
          stored = { ...(stored ?? {}), ...payload };
          return builder;
        }),
        where: () => builder,
        leftJoin: () => builder,
        select: () => builder,
        andWhere: () => builder,
        orderBy: () => builder,
        addOrderBy: () => builder,
        execute: jest.fn(async () => ({ raw: [{ id: (stored as any)?.id ?? 'repo-id' }] })),
        getRawMany: jest.fn(async () => []),
      };
      return builder;
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
      {
        id: 'section-exp-2',
        title: 'Experience',
        sectionType: 'EXPERIENCE',
        content: [
          'Principal Program Manager | Example Co',
          'Remote 2018 - 2020',
          '- Built operating rhythms and release tracking that improved team execution.',
          '- Coordinated cross-functional updates to reduce delivery friction.',
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

    const baselineRepository = {
      findOne: jest.fn(async () => baseline),
      createQueryBuilder: jest.fn(() => {
        const builder: any = {
          leftJoin: jest.fn(() => builder),
          select: jest.fn(() => builder),
          where: jest.fn(() => builder),
          andWhere: jest.fn(() => builder),
          orderBy: jest.fn(() => builder),
          addOrderBy: jest.fn(() => builder),
          getRawMany: jest.fn(async () => {
            const sectionRows = (baseline.sections ?? []).map((section: any) => ({
              baseline_id: baseline.id,
              baseline_userId: baseline.userId,
              baseline_version: 1,
              baseline_versionNumber: 1,
              baseline_originalFilename: null,
              baseline_mimeType: null,
              baseline_storagePath: null,
              baseline_hash: null,
              baseline_status: 'ACTIVE',
              baseline_isActive: true,
              baseline_archivedAt: null,
              baseline_originalBaselineScore: null,
              baseline_latestBaselineScore: null,
              baseline_latestAssessmentId: null,
              baseline_firstAnalyzedAt: null,
              baseline_lastAnalyzedAt: null,
              baseline_isSynthetic: false,
              baseline_syntheticScenarioKey: null,
              baseline_syntheticRunId: null,
              baseline_syntheticCreatedAt: null,
              baseline_preserveFromCleanup: false,
              sections_id: section.id,
              sections_baselineId: baseline.id,
              sections_sectionType: section.sectionType,
              sections_title: section.title,
              sections_content: section.content,
              sections_includePolicy: section.includePolicy ?? null,
              sections_order: section.order ?? 0,
              sections_createdAt: new Date(),
              sections_updatedAt: new Date(),
              parsedRecords_id: null,
            }));
            const parsedRows = (baseline.parsedRecords ?? []).map((parsed: any) => ({
              baseline_id: baseline.id,
              baseline_userId: baseline.userId,
              baseline_version: 1,
              baseline_versionNumber: 1,
              baseline_originalFilename: null,
              baseline_mimeType: null,
              baseline_storagePath: null,
              baseline_hash: null,
              baseline_status: 'ACTIVE',
              baseline_isActive: true,
              baseline_archivedAt: null,
              baseline_originalBaselineScore: null,
              baseline_latestBaselineScore: null,
              baseline_latestAssessmentId: null,
              baseline_firstAnalyzedAt: null,
              baseline_lastAnalyzedAt: null,
              baseline_isSynthetic: false,
              baseline_syntheticScenarioKey: null,
              baseline_syntheticRunId: null,
              baseline_syntheticCreatedAt: null,
              baseline_preserveFromCleanup: false,
              sections_id: null,
              parsedRecords_id: 'parsed-1',
              parsedRecords_baselineId: baseline.id,
              parsedRecords_sourceFileId: 'source-1',
              parsedRecords_schemaVersion: '1',
              parsedRecords_sourceFormat: 'pdf',
              parsedRecords_ingestedAt: parsed.createdAt ?? new Date(),
              parsedRecords_parsedJson: parsed.parsedJson ?? null,
              parsedRecords_resumeV2Json: parsed.resumeV2Json ?? null,
              parsedRecords_flagsJson: null,
              parsedRecords_createdAt: parsed.createdAt ?? new Date(),
            }));
            return [...sectionRows, ...parsedRows];
          }),
        };
        return builder;
      }),
    };
    const baselineVersionRepository = { findOne: jest.fn(async () => baselineVersion) };
    const jobRepository = { findOne: jest.fn(async () => job) };
    const assessmentRepository = {
      findOne: jest.fn(async () => assessment),
      createQueryBuilder: jest.fn(() => {
        const builder: any = {
          select: jest.fn(() => builder),
          where: jest.fn(() => builder),
          andWhere: jest.fn(() => builder),
          leftJoin: jest.fn(() => builder),
          orderBy: jest.fn(() => builder),
          addOrderBy: jest.fn(() => builder),
          getRawOne: jest.fn(async () => ({
            assessment_id: assessment.id,
            assessment_userId: assessment.userId,
            assessment_jobId: assessment.jobId,
            assessment_baselineId: assessment.baselineId,
            assessment_baselineVersion: assessment.baselineVersion,
            assessment_overallScore: assessment.overallScore,
            assessment_verdict: null,
            assessment_dimensionScores: null,
            assessment_strengths: null,
            assessment_gaps: null,
            assessment_complianceFlags: null,
            assessment_confidenceScore: null,
            assessment_confidenceReasons: null,
            assessment_scoringReliability: null,
            assessment_scoringReliabilityReason: null,
            assessment_scoringV2: null,
            assessment_inputsHash: 'assessment-inputs-hash',
            assessment_isSynthetic: false,
            assessment_syntheticScenarioKey: null,
            assessment_syntheticRunId: null,
            assessment_syntheticCreatedAt: null,
            assessment_preserveFromCleanup: false,
            assessment_createdAt: new Date(),
          })),
          getOne: jest.fn(async () => assessment),
        };
        return builder;
      }),
    };

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
      expect(resumeText).toMatch(/repeatable playbooks/i);
      expect(resumeText).toMatch(/support operations/i);

      await expect(
        coverLettersService.generateCoverLetter('user-1', {
        baselineId,
        baselineVersionId,
        jobId,
        analysisId,
        } as any),
      ).rejects.toMatchObject({
        response: {
          code: 'canonical_cover_letter_evidence_insufficient',
        },
      });
      expect(coverGeneratorSpy).not.toHaveBeenCalled();

      const coverInput = coverGeneratorSpy.mock.calls[0]?.[0] as any;
      if (coverInput) {
        const coverAuthority = String(
          (coverInput?.allowedBaselineBlocks ?? []).map((b: any) => b?.content ?? '').join('\n'),
        );
        expect(coverAuthority).not.toContain(RESUME_V2_AUTHORITY_IMPOSSIBLE_MARKER);
        expect(coverAuthority).toMatch(/Alex Candidate/i);
      }
    } finally {
      coverGeneratorSpy.mockRestore();
      interpretSpy.mockRestore();
      if (originalFlag === undefined) delete process.env[RESUME_GENERATION_V2_FEATURE_FLAG];
      else process.env[RESUME_GENERATION_V2_FEATURE_FLAG] = originalFlag;
    }
  });
});
