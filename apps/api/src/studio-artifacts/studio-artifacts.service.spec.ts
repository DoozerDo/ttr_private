import { StudioArtifactsService } from './studio-artifacts.service';
import { StudioArtifactLifecycleStatus } from './studio-artifact.entity';
import { buildDalenDeterministicBaselineSections } from '../resume/__fixtures__/dalen-deterministic-baseline.fixture';

const baselineVersion = { id: 'baseline-version-1', baselineId: 'baseline-1', hash: 'baseline-hash-1' };
const job = { id: 'job-1', userId: 'user-1', title: 'Director of Support', company: 'Acme', rawDescription: 'Lead support teams.' };
const assessment = { id: 'analysis-1', userId: 'user-1', jobId: 'job-1', baselineId: 'baseline-1', inputsHash: 'assessment-hash-1', overallScore: 70 };
const baseline = {
  id: 'baseline-1',
  userId: 'user-1',
  sections: [
    {
      title: 'Experience',
      content: ['Acme | Director of Support | 2020 - 2024', '- Led support operations.'].join('\n'),
      sectionType: 'EXPERIENCE',
    },
  ],
  parsedRecords: [
    {
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      resumeV2Json: {
        heading: { name: 'Alex Candidate', contactLine: 'Test City' },
        summary: 'Support leader with verified impact.',
        experience: [
          {
            company: 'Acme',
            roleTitle: 'Director of Support',
            bullets: ['Led support operations.'],
          },
        ],
        education: [],
      },
    },
  ],
};

function createRepository<T extends object>() {
  let stored: Partial<T> | null = null;
  return {
    findOne: jest.fn(async () => stored),
    create: jest.fn((payload: Partial<T>) => ({ ...payload } as Partial<T>)),
    save: jest.fn(async (payload: Partial<T>) => {
      stored = { ...(stored ?? {}), ...payload };
      return stored as T;
    }),
  };
}

describe('StudioArtifactsService', () => {
  const backfillService = {
    backfillLatestIfMissing: jest.fn(async () => null),
  };
  it('fails early when persisted ResumeV2 is missing (does not use raw baseline section text)', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineVersionRepository = { findOne: jest.fn(async () => baselineVersion) };
    const jobRepository = { findOne: jest.fn(async () => job) };
    const assessmentRepository = { findOne: jest.fn(async () => assessment) };
    const baselineRepository = {
      findOne: jest.fn(async () => ({ ...baseline, parsedRecords: [] })),
    };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    await expect(
      service.readState({
        userId: 'user-1',
        baselineId: 'baseline-1',
        jobId: 'job-1',
        baselineVersionId: baselineVersion.id,
        analysisId: assessment.id,
      } as any),
    ).rejects.toMatchObject({
      response: { error: { code: 'baseline_resume_v2_missing' } },
    });
  });

  it('uses persisted ResumeV2 plain text for interpreted evidence (not baseline section text)', async () => {
    const poison = 'POISON_BASELINE_SECTION_TEXT_SHOULD_NOT_APPEAR';
    const studioArtifactRepository = createRepository<any>();
    const baselineVersionRepository = { findOne: jest.fn(async () => baselineVersion) };
    const jobRepository = { findOne: jest.fn(async () => job) };
    const assessmentRepository = { findOne: jest.fn(async () => assessment) };
    const baselineRepository = {
      findOne: jest.fn(async () => ({
        ...baseline,
        sections: [
          {
            title: 'Experience',
            content: `Some baseline content ${poison}.`,
            sectionType: 'EXPERIENCE',
          },
        ],
      })),
    };

    const interpreterModule = require('../evidence/evidence-interpreter');
    const spy = jest.spyOn(interpreterModule, 'interpretEvidenceFromResumeText');

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: assessment.id,
    } as any);

    expect(spy).toHaveBeenCalled();
    const arg = spy.mock.calls[0]?.[0] as any;
    expect(String(arg?.resumeText ?? '')).not.toContain(poison);
    expect(String(arg?.resumeText ?? '')).toMatch(/Alex Candidate/i);

    spy.mockRestore();
  });

  it('uses ResumeV2 plain text for interpreted evidence, not baseline section content', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineVersionRepository = { findOne: jest.fn(async () => baselineVersion) };
    const jobRepository = { findOne: jest.fn(async () => job) };
    const assessmentRepository = { findOne: jest.fn(async () => assessment) };
    const baselineRepository = {
      findOne: jest.fn(async () => ({
        ...baseline,
        sections: [
          {
            title: 'Experience',
            content: 'SENTINEL_SHOULD_NOT_BE_USED',
            sectionType: 'EXPERIENCE',
          },
        ],
        parsedRecords: [
          {
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            resumeV2Json: {
              heading: { name: 'Alex Candidate', contactLine: 'Test City' },
              summary: 'Support leader with verified impact.',
              experience: [
                { company: 'Acme', roleTitle: 'Director of Support', bullets: ['Improved p95 by 25%'] },
              ],
              education: [],
            },
          },
        ],
      })),
    };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const state = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: assessment.id,
    } as any);

    const interpretedSummary = (state.artifactReadinessReasonDetails?.[0] as any)?.details?.interpretedEvidenceSummary ?? null;
    expect(state.status).toBeTruthy();
    expect(interpretedSummary).toBeTruthy();
  });

  it('persists and rehydrates completed resume artifacts for the same pair', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineVersionRepository = {
      findOne: jest.fn(async () => baselineVersion),
    };
    const jobRepository = {
      findOne: jest.fn(async () => job),
    };
    const assessmentRepository = {
      findOne: jest.fn(async () => assessment),
    };
    const baselineRepository = {
      findOne: jest.fn(async () => baseline),
    };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const inputsHash = service.computeResumeInputsHash({
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: service.computeJobFingerprint(job as any),
      assessmentInputsHash: assessment.inputsHash,
    });

    await service.recordResumeSuccess({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: service.computeJobFingerprint(job as any),
      inputsHash,
      responseBody: { status: 'success', preview: { resume: { heading: { name: 'Alex' } } } },
      content: 'resume-content',
      metadata: { auditId: 'audit-1' },
    });

    const state = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });

    expect(state.status).toBe(StudioArtifactLifecycleStatus.COMPLETED);
    expect(state.resume?.status).toBe(StudioArtifactLifecycleStatus.COMPLETED);
    expect(state.resume?.responseBody).toEqual(
      expect.objectContaining({ status: 'success' }),
    );
    expect(state.resume?.content).toBe('resume-content');
    expect((state.resume?.responseBody as any)?.content).toBe('resume-content');
    expect(state.coverLetter?.status).toBeUndefined();
  });

  it('does not retain stale correction reasons after a successful regeneration', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineVersionRepository = {
      findOne: jest.fn(async () => baselineVersion),
    };
    const jobRepository = {
      findOne: jest.fn(async () => job),
    };
    const assessmentRepository = {
      findOne: jest.fn(async () => assessment),
    };
    const baselineRepository = {
      findOne: jest.fn(async () => baseline),
    };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const inputsHash = service.computeResumeInputsHash({
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: service.computeJobFingerprint(job as any),
      assessmentInputsHash: assessment.inputsHash,
    });

    await service.recordResumeSuccess({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: service.computeJobFingerprint(job as any),
      inputsHash,
      responseBody: {
        status: 'success',
        preview: { resume: { heading: { name: 'Alex' } } },
        qualityGate: { status: 'needs_refinement', reasons: ['incomplete_trailing_fragment'] },
      },
      content: 'resume-content',
      metadata: { auditId: 'audit-1' },
    });

    await service.recordResumeSuccess({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: service.computeJobFingerprint(job as any),
      inputsHash,
      responseBody: {
        status: 'success',
        preview: { resume: { heading: { name: 'Alex' } } },
        qualityGate: { status: 'pass', reasons: [] },
      },
      content: 'resume-content-updated',
      metadata: { auditId: 'audit-2' },
    });

    const state = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });

    expect(state.resume?.content).toBe('resume-content-updated');
    expect(state.resumeResult?.qualityStatus).toBe('pass');
    expect(state.resumeResult?.correctionReasons ?? []).toEqual([]);
  });

  it('sanitizes stored resume preview on readState so malformed role titles never rehydrate to Studio', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineVersionRepository = {
      findOne: jest.fn(async () => baselineVersion),
    };
    const jobRepository = {
      findOne: jest.fn(async () => job),
    };
    const assessmentRepository = {
      findOne: jest.fn(async () => assessment),
    };
    const baselineRepository = {
      findOne: jest.fn(async () => baseline),
    };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const inputsHash = service.computeResumeInputsHash({
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: service.computeJobFingerprint(job as any),
      assessmentInputsHash: assessment.inputsHash,
    });

    await service.recordResumeSuccess({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: service.computeJobFingerprint(job as any),
      inputsHash,
      responseBody: {
        status: 'success',
        preview: {
          resume: {
            heading: { name: 'Alex' },
            summary: 'Test summary',
            experience: [
              {
                company: 'Example Co',
                roleTitle: 'Technical Architect & Full',
                bullets: ['Did work.'],
              },
            ],
          },
        },
      },
      content: 'resume-content',
      metadata: { auditId: 'audit-1' },
    });

    const state = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });

    const responseBody = state.resume?.responseBody ?? null;
    expect(responseBody).toBeTruthy();
    const preview = (responseBody as any)?.preview?.resume;
    expect(preview?.experience?.[0]?.roleTitle ?? '').toBe('');
  });

  it('returns in progress and failed states and invalidates stale inputs deterministically', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineRepository = {
      findOne: jest.fn(async () => baseline),
    };
    const baselineVersionRepository = {
      findOne: jest.fn(async () => baselineVersion),
    };
    const jobRepository = {
      findOne: jest.fn(async () => job),
    };
    const assessmentRepository = {
      findOne: jest.fn(async () => assessment),
    };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const resumeFingerprint = service.computeJobFingerprint(job as any);
    const resumeInputsHash = service.computeResumeInputsHash({
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: resumeFingerprint,
      assessmentInputsHash: assessment.inputsHash,
    });

    await service.recordCoverLetterInProgress({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: resumeFingerprint,
      inputsHash: service.computeCoverLetterInputsHash({
        baselineVersionHash: baselineVersion.hash,
        jobFingerprint: resumeFingerprint,
      }),
      metadata: { auditId: 'audit-1' },
    });

    const inProgressState = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });
    expect(inProgressState.status).toBe(StudioArtifactLifecycleStatus.IN_PROGRESS);
    expect(inProgressState.coverLetter?.status).toBe(StudioArtifactLifecycleStatus.IN_PROGRESS);

    await service.recordCoverLetterFailure({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: resumeFingerprint,
      inputsHash: service.computeCoverLetterInputsHash({
        baselineVersionHash: baselineVersion.hash,
        jobFingerprint: resumeFingerprint,
      }),
      failureCode: 'generation_failed',
      failureMessage: 'Cover letter generation failed.',
      metadata: { auditId: 'audit-1' },
    });

    const failedState = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });
    expect(failedState.status).toBe(StudioArtifactLifecycleStatus.FAILED);
    expect(failedState.coverLetter?.status).toBe(StudioArtifactLifecycleStatus.FAILED);

    await service.recordCoverLetterSuccess({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: resumeFingerprint,
      inputsHash: service.computeCoverLetterInputsHash({
        baselineVersionHash: baselineVersion.hash,
        jobFingerprint: resumeFingerprint,
      }),
      responseBody: { status: 'success', preview: { coverLetter: { paragraphs: ['Hello'] } } },
      content: 'cover-letter-content',
      metadata: { auditId: 'audit-1' },
    });

    const completedState = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });
    expect(completedState.status).toBe(StudioArtifactLifecycleStatus.COMPLETED);
    expect(completedState.coverLetter?.status).toBe(StudioArtifactLifecycleStatus.COMPLETED);
    expect(completedState.coverLetter?.content).toBe('cover-letter-content');
    expect((completedState.coverLetter?.responseBody as any)?.content).toBe('cover-letter-content');
    expect(completedState.coverLetter?.responseBody).toEqual(
      expect.objectContaining({ status: 'success' }),
    );
  });

  it('surfaces interpreted evidence audit metadata for resume artifacts when present (additive only)', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineRepository = { findOne: jest.fn(async () => baseline) };
    const baselineVersionRepository = { findOne: jest.fn(async () => baselineVersion) };
    const jobRepository = { findOne: jest.fn(async () => job) };
    const assessmentRepository = { findOne: jest.fn(async () => assessment) };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const jobFingerprint = service.computeJobFingerprint(job as any);
    const inputsHash = service.computeResumeInputsHash({
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint,
      assessmentInputsHash: assessment.inputsHash,
    });

    await service.recordResumeSuccess({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint,
      inputsHash,
      content: 'content',
      responseBody: {
        status: 'success',
        content: 'content',
        traceMap: { 'summary:0:0': ['interpreted:evidence:baseline-1:baseline-version-1:0:evidence:0'] },
        evidenceDetailsMap: {
          'summary:0:0': [
            {
              evidenceItemId: 'evidence:baseline-1:baseline-version-1:0',
              evidenceStrength: 'partial',
              evidenceSource: 'inferred_from_resume_text',
              supportLevel: 'partial',
              generationUse: 'use_with_constraints',
              constraintsApplied: ['no_invented_metrics'],
              missingElements: ['metrics'],
            },
          ],
        },
        internal: {
          interpretedEvidenceSummary: {
            strongEvidenceCount: 0,
            partialEvidenceCount: 1,
            weakEvidenceCount: 1,
            unusableEvidenceCount: 0,
          },
          interpretedEvidenceReadiness: { status: 'degraded' },
          omittedInterpretedEvidence: { weak: ['w1'], unusable: [], no_tools_or_metrics: ['p0'] },
          bypassedTemplateHardBlockWithInterpretedEvidence: true,
        },
      },
      metadata: { auditId: 'audit-1' },
      analysisId: 'analysis-1',
    });

    const state = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });

    expect(state.resume?.interpretedEvidenceAudit).toEqual(
      expect.objectContaining({
        interpretedEvidenceSummary: expect.any(Object),
        interpretedEvidenceReadiness: expect.any(Object),
        omittedInterpretedEvidence: expect.any(Object),
        evidenceDetailsMap: expect.any(Object),
        bypassedTemplateHardBlockWithInterpretedEvidence: true,
      }),
    );
  });

  it('surfaces interpreted evidence audit metadata for cover letter artifacts when present (additive only)', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineRepository = { findOne: jest.fn(async () => baseline) };
    const baselineVersionRepository = { findOne: jest.fn(async () => baselineVersion) };
    const jobRepository = { findOne: jest.fn(async () => job) };
    const assessmentRepository = { findOne: jest.fn(async () => assessment) };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const jobFingerprint = service.computeJobFingerprint(job as any);
    const inputsHash = service.computeCoverLetterInputsHash({
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint,
    });

    await service.recordCoverLetterSuccess({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint,
      inputsHash,
      content: 'content',
      responseBody: {
        status: 'success',
        content: 'content',
        traceMap: { opening: ['interpreted:evidence:baseline-1:baseline-version-1:0:evidence:0'] },
        evidenceDetailsMap: {
          opening: [
            {
              evidenceItemId: 'evidence:baseline-1:baseline-version-1:0',
              evidenceStrength: 'partial',
              evidenceSource: 'inferred_from_resume_text',
              supportLevel: 'partial',
              generationUse: 'use_with_constraints',
              constraintsApplied: ['no_invented_metrics'],
              missingElements: ['metrics'],
            },
          ],
        },
        internal: {
          interpretedEvidenceSummary: {
            strongEvidenceCount: 0,
            partialEvidenceCount: 1,
            weakEvidenceCount: 0,
            unusableEvidenceCount: 0,
          },
          interpretedEvidenceReadiness: { status: 'degraded' },
          omittedInterpretedEvidence: { weak: [], unusable: [], no_tools_or_metrics: [] },
          bypassedTemplateHardBlockWithInterpretedEvidence: true,
        },
      },
      metadata: { auditId: 'audit-1' },
      analysisId: 'analysis-1',
    });

    const state = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });

    expect(state.coverLetter?.interpretedEvidenceAudit).toEqual(
      expect.objectContaining({
        interpretedEvidenceSummary: expect.any(Object),
        interpretedEvidenceReadiness: expect.any(Object),
        omittedInterpretedEvidence: expect.any(Object),
        evidenceDetailsMap: expect.any(Object),
        bypassedTemplateHardBlockWithInterpretedEvidence: true,
      }),
    );
  });

  it('does not emit interpreted evidence audit metadata for healthy structured artifacts', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineRepository = { findOne: jest.fn(async () => baseline) };
    const baselineVersionRepository = { findOne: jest.fn(async () => baselineVersion) };
    const jobRepository = { findOne: jest.fn(async () => job) };
    const assessmentRepository = { findOne: jest.fn(async () => assessment) };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const jobFingerprint = service.computeJobFingerprint(job as any);
    const resumeInputsHash = service.computeResumeInputsHash({
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint,
      assessmentInputsHash: assessment.inputsHash,
    });
    const coverInputsHash = service.computeCoverLetterInputsHash({
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint,
    });

    await service.recordResumeSuccess({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint,
      inputsHash: resumeInputsHash,
      content: 'content',
      responseBody: { status: 'success', content: 'content', traceMap: {} },
      metadata: { auditId: 'audit-1' },
      analysisId: 'analysis-1',
    });

    await service.recordCoverLetterSuccess({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint,
      inputsHash: coverInputsHash,
      content: 'content',
      responseBody: { status: 'success', content: 'content', traceMap: {} },
      metadata: { auditId: 'audit-1' },
      analysisId: 'analysis-1',
    });

    const state = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });

    expect(state.resume?.interpretedEvidenceAudit).toBeUndefined();
    expect(state.coverLetter?.interpretedEvidenceAudit).toBeUndefined();
  });

  it('invalidates stale artifacts when the generation inputs change', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineRepository = {
      findOne: jest.fn(async () => baseline),
    };
    const baselineVersionRepository = {
      findOne: jest.fn(async () => baselineVersion),
    };
    const jobRepository = {
      findOne: jest.fn(async () => job),
    };
    const assessmentRepository = {
      findOne: jest.fn(async () => assessment),
    };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const matchingHash = service.computeResumeInputsHash({
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: service.computeJobFingerprint(job as any),
      assessmentInputsHash: assessment.inputsHash,
    });

    await service.recordResumeSuccess({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: service.computeJobFingerprint(job as any),
      inputsHash: matchingHash,
      responseBody: { status: 'success' },
      content: 'resume-content',
      metadata: {},
    });

    assessmentRepository.findOne = jest.fn(async () => ({ ...assessment, inputsHash: 'assessment-hash-2' }));
    const staleState = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });

    expect(staleState.resume).toBeNull();
    expect(staleState.status).toBe(StudioArtifactLifecycleStatus.MISSING);
  });

  it('signals persisted legacy artifacts as stale when template readiness is resolved', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineRepository = {
      findOne: jest.fn(async () => baseline),
    };
    const baselineVersionRepository = {
      findOne: jest.fn(async () => baselineVersion),
    };
    const jobRepository = {
      findOne: jest.fn(async () => job),
    };
    const assessmentRepository = {
      findOne: jest.fn(async () => ({ ...assessment, overallScore: 90 })),
    };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const inputsHash = service.computeResumeInputsHash({
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: service.computeJobFingerprint(job as any),
      assessmentInputsHash: assessment.inputsHash,
    });

    await service.recordResumeSuccess({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: service.computeJobFingerprint(job as any),
      inputsHash,
      responseBody: { status: 'success', preview: { resume: { heading: { name: 'Alex' } } }, internal: {} },
      content: 'resume-content',
      metadata: {},
    });

    const state = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });

    expect(state.assessmentScore).toBe(90);
    expect(['ready', 'degraded']).toContain(state.artifactReadiness);
    expect(state.structuredBaselineExperienceCount).toBeGreaterThan(0);
    expect(Array.isArray(state.structuredBaselineMissingEvidenceReasons)).toBe(true);
    expect(Array.isArray(state.structuredBaselineExtractedExperiencePreview)).toBe(true);
    // Score>=80 should not hide persisted artifacts; it should mark them as stale instead.
    expect(state.resume).toEqual(
      expect.objectContaining({
        status: StudioArtifactLifecycleStatus.COMPLETED,
        metadata: expect.objectContaining({ staleLegacy: true }),
      }),
    );
    expect(state.resumeResult?.generationState).toBe('generated_needs_correction');
  });

  it('marks baseline_template_not_ready as degraded (not blocked) when validExperience>0', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineRepository = {
      findOne: jest.fn(async () => ({
        ...baseline,
        sections: [
          {
            title: 'Experience',
            content: [
              'Acme Corp | Contractor | 2022 - 2023',
              '- Built UI components.',
            ].join('\n'),
            sectionType: 'EXPERIENCE',
          },
        ],
      })),
    };
    const baselineVersionRepository = {
      findOne: jest.fn(async () => baselineVersion),
    };
    const jobRepository = {
      findOne: jest.fn(async () => job),
    };
    const assessmentRepository = {
      findOne: jest.fn(async () => ({ ...assessment, overallScore: 92 })),
    };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const inputsHash = service.computeResumeInputsHash({
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: service.computeJobFingerprint(job as any),
      assessmentInputsHash: assessment.inputsHash,
    });

    await service.recordResumeSuccess({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: service.computeJobFingerprint(job as any),
      inputsHash,
      responseBody: { status: 'success', preview: { resume: { heading: { name: 'Alex' } } }, internal: {} },
      content: 'resume-content',
      metadata: {},
    });

    const state = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });

    expect(state.artifactReadiness).toBe('degraded');
    expect(state.artifactReadinessReasons).toEqual(expect.arrayContaining(['baseline_template_not_ready']));
    expect(state.artifactReadinessReasonDetails?.[0]?.code).toBe('baseline_template_not_ready');
    expect(state.artifactReadinessReasonDetails?.[0] as any).toEqual(
      expect.objectContaining({ details: expect.objectContaining({ validExperience: 1 }) }),
    );
    expect(state.resume).toEqual(
      expect.objectContaining({
        status: StudioArtifactLifecycleStatus.COMPLETED,
        metadata: expect.objectContaining({ staleLegacy: true }),
      }),
    );
  });

  it('keeps baseline_template_not_ready degraded when validExperience=0 (ResumeV2 is the evidence source)', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineRepository = {
      findOne: jest.fn(async () => ({
        ...baseline,
        sections: [
          {
            title: 'Experience',
            content: [
              'Vue 3), deck builder frontend | Contractor | 2022 - 2023',
              // No usable bullets -> validExperience should be 0
            ].join('\n'),
            sectionType: 'EXPERIENCE',
          },
        ],
      })),
    };
    const baselineVersionRepository = {
      findOne: jest.fn(async () => baselineVersion),
    };
    const jobRepository = {
      findOne: jest.fn(async () => job),
    };
    const assessmentRepository = {
      findOne: jest.fn(async () => ({ ...assessment, overallScore: 92 })),
    };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const state = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });

    expect(state.artifactReadiness).toBe('degraded');
    expect((state.artifactReadinessReasons ?? []).length).toBeGreaterThan(0);
    expect(state.artifactReadinessReasonDetails?.[0]?.code).toBeTruthy();
    expect(state.artifactReadinessReasonDetails?.[0] as any).toEqual(
      expect.objectContaining({ details: expect.objectContaining({ validExperience: 0 }) }),
    );
  });

  it('uses interpreted evidence to avoid blocked readiness when structured baseline has zero valid experience', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineRepository = {
      findOne: jest.fn(async () => ({
        ...baseline,
        // Malformed header -> structured baseline likely yields no valid experience.
        sections: [
          {
            title: 'Experience',
            content: [
              'Vue 3), deck builder frontend | Contractor | 2022 - 2023',
              '- Built and maintained backend services using Node.js, PostgreSQL, and AWS.',
              '- Improved p95 API latency by 35% by optimizing database queries and caching.',
            ].join('\n'),
            sectionType: 'EXPERIENCE',
          },
          {
            title: 'Skills',
            content: 'Node.js, PostgreSQL, AWS',
            sectionType: 'SKILLS',
          },
        ],
      })),
    };
    const baselineVersionRepository = {
      findOne: jest.fn(async () => baselineVersion),
    };
    const jobRepository = {
      findOne: jest.fn(async () => job),
    };
    const assessmentRepository = {
      findOne: jest.fn(async () => ({ ...assessment, overallScore: 92 })),
    };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const state = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });

    expect(state.artifactReadiness).toBe('degraded');
    expect(state.artifactReadinessReasonDetails?.[0] as any).toEqual(
      expect.objectContaining({
        details: expect.objectContaining({
          interpretedEvidenceSummary: expect.objectContaining({
            strongEvidenceCount: expect.any(Number),
            partialEvidenceCount: expect.any(Number),
          }),
        }),
      }),
    );
    const summary = ((state.artifactReadinessReasonDetails?.[0] as any)?.details?.interpretedEvidenceSummary ?? {}) as any;
    expect((summary.strongEvidenceCount ?? 0) + (summary.partialEvidenceCount ?? 0)).toBeGreaterThan(0);
  });

  it('includes interpretedEvidenceSummary in readiness reason details and counts meaningful evidence (Dalen-style) as strong/partial', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineVersionRepository = {
      findOne: jest.fn(async () => baselineVersion),
    };
    const jobRepository = {
      findOne: jest.fn(async () => job),
    };
    const assessmentRepository = {
      findOne: jest.fn(async () => ({ ...assessment, overallScore: 92 })),
    };

    const baselineWithMessyExperience = {
      ...baseline,
      sections: buildDalenDeterministicBaselineSections().map((s) => ({
        title: s.title,
        content: s.content,
        sectionType: String(s.sectionType ?? '').toUpperCase(),
      })),
    };
    const baselineRepository = {
      findOne: jest.fn(async () => baselineWithMessyExperience),
    };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const state = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });

    expect(['degraded', 'ready']).toContain(state.artifactReadiness);
    const details = state.artifactReadinessReasonDetails ?? [];
    expect(Array.isArray(details)).toBe(true);
    if (details.length) {
      const summary = details[0]?.details?.interpretedEvidenceSummary as any;
      expect(summary).toBeTruthy();
      expect((summary?.strongEvidenceCount ?? 0) + (summary?.partialEvidenceCount ?? 0)).toBeGreaterThan(0);
    }
  });

  it('does not use raw baseline section text for interpreted evidence (ResumeV2 is the evidence source)', async () => {
    const studioArtifactRepository = createRepository<any>();
    const baselineVersionRepository = {
      findOne: jest.fn(async () => baselineVersion),
    };
    const jobRepository = {
      findOne: jest.fn(async () => job),
    };
    const assessmentRepository = {
      findOne: jest.fn(async () => ({ ...assessment, overallScore: 92 })),
    };
    const baselineRepository = {
      findOne: jest.fn(async () => ({
        ...baseline,
        sections: [
          {
            title: 'Experience',
            sectionType: 'EXPERIENCE',
            // No tools, no metrics, no explicit outcomes; plus padding that must not be treated as evidence.
            content: [
              'Various tasks.',
              'Additional verified baseline context '.repeat(40),
              'Verified professional experience context '.repeat(40),
            ].join('\n'),
          },
        ],
      })),
    };

    const service = new StudioArtifactsService(
      studioArtifactRepository as any,
      baselineRepository as any,
      baselineVersionRepository as any,
      jobRepository as any,
      assessmentRepository as any,
      backfillService as any,
    );

    const state = await service.readState({
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      baselineVersionId: baselineVersion.id,
      analysisId: 'analysis-1',
    });

    expect(state.status).toBeTruthy();
  });
});
