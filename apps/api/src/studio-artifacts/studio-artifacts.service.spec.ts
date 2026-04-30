import { StudioArtifactsService } from './studio-artifacts.service';
import { StudioArtifactLifecycleStatus } from './studio-artifact.entity';

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
    expect(state.coverLetter?.status).toBeUndefined();
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
    expect(completedState.coverLetter?.responseBody).toEqual(
      expect.objectContaining({ status: 'success' }),
    );
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

  it('filters out legacy/stale artifacts as current output when score >= 80', async () => {
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
    expect(state.artifactReadiness).toBe('ready');
    // Legacy internal metadata is filtered out for score>=80: record should not be treated as current.
    expect(state.resume).toBeNull();
    expect(state.resumeResult?.generationState).toBe('not_started');
  });
});
