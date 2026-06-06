import { StudioArtifactLifecycleStatus } from './studio-artifact.entity';
import { StudioArtifactsService } from './studio-artifacts.service';

describe('StudioArtifactsService (unit): resumeResult contract', () => {
  const buildResult = (
    record: any,
  ): any => {
    const service = Object.create(StudioArtifactsService.prototype) as any;
    return service.buildCanonicalResultFromRecord('resume', record);
  };

  it('builds a usable resumeResult from successful responseBody preview even when record.status is FAILED (stale failure cannot override success)', () => {
    const result = buildResult({
      status: StudioArtifactLifecycleStatus.FAILED,
      responseBody: {
        status: 'success',
        generationStatus: 'success',
        exportReady: true,
        exports: { docx: true, pdf: true },
        qualityGate: { status: 'pass', reasons: [] },
        preview: {
          resume: {
            heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
            summary: 'Renderable preview should win.',
            experience: [],
          },
        },
      },
      failureCode: 'generation_failed',
      failureMessage: 'Stale failure status.',
    });

    expect(result.artifactType).toBe('resume');
    expect(result.generationState).toBe('generated_usable');
    expect(result.qualityStatus).toBe('pass');
    expect(result.preview).toBeTruthy();
    expect(result.exportReady).toBe(true);
    expect(result.exports).toEqual({ docx: true, pdf: true });
  });

  it('keeps a renderable resume preview visible when export is ineligible and qualityGate is absent', async () => {
    const studioArtifactRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'artifact-3',
        createdAt: new Date('2026-06-03T00:00:00.000Z'),
        updatedAt: new Date('2026-06-03T00:01:00.000Z'),
        resumeStatus: StudioArtifactLifecycleStatus.COMPLETED,
        resumeInputsHash: 'stored-hash',
        resumeResponseBody: {
          status: 'success',
          generationStatus: 'success',
          exportReady: false,
          preview: {
            resume: {
              heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
              summary: 'Renderable preview should remain visible.',
              experience: [{ company: 'Co', roleTitle: 'Role', bullets: ['Did work.'] }],
            },
          },
          internal: { resumeGenerationMode: 'baseline_verified_generation' },
        },
        resumeContent: 'Resume content',
        resumeFailureCode: null,
        resumeFailureMessage: null,
        resumeGenerationStartedAt: null,
        resumeGeneratedAt: new Date('2026-06-03T00:01:00.000Z'),
        resumeFailedAt: null,
        resumeMetadata: {},
        coverLetterStatus: StudioArtifactLifecycleStatus.COMPLETED,
        coverLetterInputsHash: 'stored-hash',
        coverLetterResponseBody: {
          status: 'success',
          generationStatus: 'success',
          exportReady: true,
          qualityGate: { status: 'pass', reasons: [] },
          preview: { coverLetter: { paragraphs: ['Hello'] } },
        },
        coverLetterContent: 'Hello',
        coverLetterFailureCode: null,
        coverLetterFailureMessage: null,
        coverLetterGenerationStartedAt: null,
        coverLetterGeneratedAt: new Date('2026-06-03T00:01:00.000Z'),
        coverLetterFailedAt: null,
        coverLetterMetadata: {},
      } as any),
    } as any;

    const baselineRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
    } as any;
    const baselineVersionRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'base-version-1', baselineId: 'base-1', hash: 'hash-v1' }),
    } as any;
    const jobRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'job-1', title: 'Role', company: 'Co' }),
    } as any;
    const fitAssessmentRepository = {
      findOne: jest.fn().mockResolvedValue({ overallScore: 90 }),
    } as any;
    const baselineResumeV2BackfillService = {
      backfillLatestIfMissing: jest.fn().mockResolvedValue(null),
    } as any;

    const service = new StudioArtifactsService(
      studioArtifactRepository,
      baselineRepository,
      baselineVersionRepository,
      jobRepository,
      fitAssessmentRepository,
      baselineResumeV2BackfillService,
    );
    jest.spyOn(service as any, 'computeResumeInputsHash').mockReturnValue('derived-hash');
    jest.spyOn(service as any, 'computeCoverLetterInputsHash').mockReturnValue('derived-hash');

    const state = await service.readState({
      userId: 'u-1',
      baselineId: 'base-1',
      baselineVersionId: 'base-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    } as any);

    expect(state.resume?.responseBody).toBeTruthy();
    expect(state.resumeResult).toBeTruthy();
    expect((state.resumeResult as any)?.preview).toBeTruthy();
    expect((state.resumeResult as any)?.generationState).toBe('generated_needs_correction');
    expect((state.resumeResult as any)?.qualityStatus).toBe('needs_refinement');
    expect((state.resumeResult as any)?.exportReady).toBe(false);
    expect(state.coverLetterResult).toBeTruthy();
    expect((state.coverLetterResult as any)?.generationState).toBe('generated_usable');
  });

  it('preserves failed resumeResult when record.status is FAILED and responseBody is not renderable', () => {
    const result = buildResult({
      status: StudioArtifactLifecycleStatus.FAILED,
      responseBody: {
        status: 'success',
        generationStatus: 'success',
        exportReady: true,
        exports: { docx: true, pdf: true },
        qualityGate: { status: 'pass', reasons: [] },
        preview: { resume: null },
      },
      failureCode: 'generation_failed',
      failureMessage: 'No renderable preview.',
    });

    expect(result.generationState).toBe('generation_failed');
    expect(result.qualityStatus).toBe('failed');
    expect(result.preview).toBe(null);
  });
});

describe('StudioArtifactsService (unit): artifact record hydration metadata', () => {
  it('exposes artifactId/createdAt/updatedAt/generationRunId on the hydrated resume record', () => {
    const service = Object.create(StudioArtifactsService.prototype) as any;
    const createdAt = new Date('2026-05-30T12:00:00.000Z');
    const updatedAt = new Date('2026-05-30T12:05:00.000Z');

    const record = {
      id: 'artifact-123',
      createdAt,
      updatedAt,
      resumeStatus: StudioArtifactLifecycleStatus.FAILED,
      resumeInputsHash: 'hash-1',
      resumeResponseBody: null,
      resumeContent: null,
      resumeFailureCode: 'unsupported_input',
      resumeFailureMessage: 'Old failure.',
      resumeGenerationStartedAt: null,
      resumeGeneratedAt: null,
      resumeFailedAt: new Date('2026-05-30T12:04:00.000Z'),
      resumeMetadata: { auditId: 'run-abc' },
    };

    const hydrated = service.buildArtifactRecord(record, 'resume', 'hash-1');
    expect(hydrated).toBeTruthy();
    expect(hydrated.artifactId).toBe('artifact-123');
    expect(hydrated.createdAt).toBe('2026-05-30T12:00:00.000Z');
    expect(hydrated.updatedAt).toBe('2026-05-30T12:05:00.000Z');
    expect(hydrated.generationRunId).toBe('run-abc');
    expect(hydrated.artifactSource).toBe('persisted');
  });

  it('rejects minimal fail-safe resume artifacts from reuse/currentness when auditId is minimal:* and generationMode is top_level_fail_safe_minimal', () => {
    const service = Object.create(StudioArtifactsService.prototype) as any;

    const record = {
      id: 'artifact-1',
      createdAt: new Date('2026-05-31T00:00:00.000Z'),
      updatedAt: new Date('2026-05-31T00:01:00.000Z'),
      resumeStatus: StudioArtifactLifecycleStatus.COMPLETED,
      resumeInputsHash: 'hash-1',
      resumeResponseBody: {
        status: 'success',
        generationStatus: 'success',
        auditId: 'minimal:1780277132821',
        preview: { resume: { heading: { name: 'Alex' }, experience: [] } },
        internal: {
          resumeGenerationMode: 'top_level_fail_safe_minimal',
          resumeFailSafeMinimalUsed: true,
        },
      },
      resumeContent: 'x'.repeat(318),
      resumeFailureCode: null,
      resumeFailureMessage: null,
      resumeGenerationStartedAt: null,
      resumeGeneratedAt: new Date('2026-05-31T00:01:00.000Z'),
      resumeFailedAt: null,
      resumeMetadata: {},
    };

    const hydrated = service.buildArtifactRecord(record, 'resume', 'hash-1');
    expect(hydrated.inputsHashMatches).toBe(true);
    expect(hydrated.artifactCurrent).toBe(false);
    expect(hydrated.usableCurrent).toBe(false);
  });
});

describe('StudioArtifactsService (unit): readState suppresses rejected resume artifacts', () => {
  it('returns null resume.responseBody/content when a minimal resume artifact is rejected from preview/use', async () => {
    const studioArtifactRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'artifact-1',
        createdAt: new Date('2026-05-31T00:00:00.000Z'),
        updatedAt: new Date('2026-05-31T00:01:00.000Z'),
        resumeStatus: StudioArtifactLifecycleStatus.COMPLETED,
        resumeInputsHash: 'hash-1',
        resumeResponseBody: {
          status: 'success',
          generationStatus: 'success',
          auditId: 'minimal:1780277132821',
          preview: { resume: { heading: { name: 'Alex' }, experience: [] } },
          internal: {
            resumeGenerationMode: 'top_level_fail_safe_minimal',
            resumeFailSafeMinimalUsed: true,
          },
          qualityGate: { status: 'pass', reasons: [] },
        },
        resumeContent: 'x'.repeat(318),
        resumeFailureCode: null,
        resumeFailureMessage: null,
        resumeGenerationStartedAt: null,
        resumeGeneratedAt: new Date('2026-05-31T00:01:00.000Z'),
        resumeFailedAt: null,
        resumeMetadata: { auditId: 'minimal:1780277132821' },
        coverLetterStatus: StudioArtifactLifecycleStatus.MISSING,
        coverLetterInputsHash: null,
        coverLetterResponseBody: null,
        coverLetterContent: null,
        coverLetterFailureCode: null,
        coverLetterFailureMessage: null,
        coverLetterGenerationStartedAt: null,
        coverLetterGeneratedAt: null,
        coverLetterFailedAt: null,
        coverLetterMetadata: {},
      } as any),
    } as any;

    const baselineRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
    } as any;
    const baselineVersionRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'base-version-1', baselineId: 'base-1', hash: 'hash-v1' }),
    } as any;
    const jobRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'job-1', title: 'Role', company: 'Co' }),
    } as any;
    const fitAssessmentRepository = {
      findOne: jest.fn().mockResolvedValue({ overallScore: 90 }),
    } as any;
    const baselineResumeV2BackfillService = {
      backfillLatestIfMissing: jest.fn().mockResolvedValue(null),
    } as any;

    const service = new StudioArtifactsService(
      studioArtifactRepository,
      baselineRepository,
      baselineVersionRepository,
      jobRepository,
      fitAssessmentRepository,
      baselineResumeV2BackfillService,
    );

    const state = await service.readState({
      userId: 'u-1',
      baselineId: 'base-1',
      baselineVersionId: 'base-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    });

    expect(state.resume).toBeTruthy();
    expect(state.resume?.artifactCurrent).toBe(false);
    expect(state.resume?.responseBody).toBeNull();
    expect(state.resume?.content).toBeNull();
  });
});

describe('StudioArtifactsService (unit): readState surfaces renderable resume previews even when quality gates fail', () => {
  it('keeps resume.responseBody and resumeResult.preview when preview.resume exists and artifact is current', async () => {
    const studioArtifactRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'artifact-1',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:01:00.000Z'),
        resumeStatus: StudioArtifactLifecycleStatus.COMPLETED,
        resumeInputsHash: 'hash-1',
        resumeResponseBody: {
          status: 'success',
          generationStatus: 'success',
          exportReady: false,
          qualityGate: { status: 'failed', reasons: ['quality_failed_fixture'] },
          preview: { resume: { heading: { name: 'Alex' }, experience: [{ company: 'Co', roleTitle: 'Role', bullets: ['Did work.'] }] } },
        },
        resumeContent: 'Resume content',
        resumeFailureCode: null,
        resumeFailureMessage: null,
        resumeGenerationStartedAt: null,
        resumeGeneratedAt: new Date('2026-06-01T00:01:00.000Z'),
        resumeFailedAt: null,
        resumeMetadata: {},
        coverLetterStatus: StudioArtifactLifecycleStatus.COMPLETED,
        coverLetterInputsHash: 'hash-1',
        coverLetterResponseBody: {
          status: 'success',
          generationStatus: 'success',
          exportReady: true,
          qualityGate: { status: 'pass', reasons: [] },
          preview: { coverLetter: { paragraphs: ['Hello'] } },
        },
        coverLetterContent: 'Hello',
        coverLetterFailureCode: null,
        coverLetterFailureMessage: null,
        coverLetterGenerationStartedAt: null,
        coverLetterGeneratedAt: new Date('2026-06-01T00:01:00.000Z'),
        coverLetterFailedAt: null,
        coverLetterMetadata: {},
      } as any),
    } as any;

    const baselineRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
    } as any;
    const baselineVersionRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'base-version-1', baselineId: 'base-1', hash: 'hash-v1' }),
    } as any;
    const jobRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'job-1', title: 'Role', company: 'Co' }),
    } as any;
    const fitAssessmentRepository = {
      findOne: jest.fn().mockResolvedValue({ overallScore: 90 }),
    } as any;
    const baselineResumeV2BackfillService = {
      backfillLatestIfMissing: jest.fn().mockResolvedValue(null),
    } as any;

    const service = new StudioArtifactsService(
      studioArtifactRepository,
      baselineRepository,
      baselineVersionRepository,
      jobRepository,
      fitAssessmentRepository,
      baselineResumeV2BackfillService,
    );
    // Make the artifact "current" for this test by forcing the derived inputsHash to match the stored one.
    jest.spyOn(service as any, 'computeResumeInputsHash').mockReturnValue('hash-1');
    jest.spyOn(service as any, 'computeCoverLetterInputsHash').mockReturnValue('hash-1');

    const state = await service.readState({
      userId: 'u-1',
      baselineId: 'base-1',
      baselineVersionId: 'base-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    } as any);

    expect(state.resume?.artifactCurrent).toBe(true);
    expect(state.resume?.responseBody).toBeTruthy();
    expect(state.resumeResult).toBeTruthy();
    expect((state.resumeResult as any)?.preview).toBeTruthy();
    expect((state.resumeResult as any)?.generationState).toBe('generated_needs_correction');
    expect((state.resumeResult as any)?.qualityStatus).toBe('needs_refinement');
    expect((state.resumeResult as any)?.exportReady).toBe(false);
  });
});

describe('StudioArtifactsService (unit): readState never erases renderable preview when export is ineligible', () => {
  it('preserves resumeResult.preview when inputsHash mismatches but preview.resume exists', async () => {
    const studioArtifactRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'artifact-1',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:01:00.000Z'),
        resumeStatus: StudioArtifactLifecycleStatus.COMPLETED,
        // Stored hash does not match derived hash => export ineligible, but preview is renderable.
        resumeInputsHash: 'stored-hash',
        resumeResponseBody: {
          status: 'success',
          generationStatus: 'success',
          exportReady: true,
          qualityGate: { status: 'pass', reasons: [] },
          preview: { resume: { heading: { name: 'Alex' }, experience: [{ company: 'Co', roleTitle: 'Role', bullets: ['Did work.'] }] } },
        },
        resumeContent: 'Resume content',
        resumeFailureCode: null,
        resumeFailureMessage: null,
        resumeGenerationStartedAt: null,
        resumeGeneratedAt: new Date('2026-06-01T00:01:00.000Z'),
        resumeFailedAt: null,
        resumeMetadata: {},
        coverLetterStatus: StudioArtifactLifecycleStatus.COMPLETED,
        coverLetterInputsHash: 'stored-hash',
        coverLetterResponseBody: {
          status: 'success',
          generationStatus: 'success',
          exportReady: true,
          qualityGate: { status: 'pass', reasons: [] },
          preview: { coverLetter: { paragraphs: ['Hello'] } },
        },
        coverLetterContent: 'Hello',
        coverLetterFailureCode: null,
        coverLetterFailureMessage: null,
        coverLetterGenerationStartedAt: null,
        coverLetterGeneratedAt: new Date('2026-06-01T00:01:00.000Z'),
        coverLetterFailedAt: null,
        coverLetterMetadata: {},
      } as any),
    } as any;

    const baselineRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
    } as any;
    const baselineVersionRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'base-version-1', baselineId: 'base-1', hash: 'hash-v1' }),
    } as any;
    const jobRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'job-1', title: 'Role', company: 'Co' }),
    } as any;
    const fitAssessmentRepository = {
      findOne: jest.fn().mockResolvedValue({ overallScore: 90 }),
    } as any;
    const baselineResumeV2BackfillService = {
      backfillLatestIfMissing: jest.fn().mockResolvedValue(null),
    } as any;

    const service = new StudioArtifactsService(
      studioArtifactRepository,
      baselineRepository,
      baselineVersionRepository,
      jobRepository,
      fitAssessmentRepository,
      baselineResumeV2BackfillService,
    );
    // Derived hashes intentionally do not match the stored ones.
    jest.spyOn(service as any, 'computeResumeInputsHash').mockReturnValue('derived-hash');
    jest.spyOn(service as any, 'computeCoverLetterInputsHash').mockReturnValue('derived-hash');

    const state = await service.readState({
      userId: 'u-1',
      baselineId: 'base-1',
      baselineVersionId: 'base-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    } as any);

    expect(state.resume?.inputsHashMatches).toBe(false);
    expect(state.resumeResult).toBeTruthy();
    expect((state.resumeResult as any)?.preview).toBeTruthy();
    expect((state.resumeResult as any)?.generationState).toBe('generated_needs_correction');
    expect((state.resumeResult as any)?.exportReady).toBe(false);
  });
});

describe('StudioArtifactsService (unit): studio artifact scope upsert is idempotent', () => {
  it('does insert-or-update without throwing UQ_studio_artifacts_scope and logs create vs update decisions', async () => {
    const insertExecute = jest.fn();
    const updateExecute = jest.fn();
    const findOne = jest.fn();

    const insertBuilder = {
      insert: () => insertBuilder,
      into: () => insertBuilder,
      values: () => insertBuilder,
      onConflict: () => insertBuilder,
      returning: () => insertBuilder,
      execute: insertExecute,
    };

    const updateBuilder = {
      update: () => updateBuilder,
      set: () => updateBuilder,
      where: () => updateBuilder,
      execute: updateExecute,
    };

    const createQueryBuilder = jest.fn(() => insertBuilder as any);

    const repo = {
      createQueryBuilder,
      findOne,
    } as any;

    const service = new StudioArtifactsService(repo);

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // First call: insert wins.
    insertExecute.mockResolvedValueOnce({ raw: [{ id: 'artifact-1' }] });
    // Second call: insert does nothing, then update path runs.
    insertExecute.mockResolvedValueOnce({ raw: [] });

    // Swap to update builder for the update call.
    createQueryBuilder.mockImplementationOnce(() => insertBuilder as any);
    createQueryBuilder.mockImplementationOnce(() => insertBuilder as any);
    createQueryBuilder.mockImplementationOnce(() => updateBuilder as any);

    updateExecute.mockResolvedValueOnce({ affected: 1 });
    findOne.mockResolvedValueOnce({ id: 'artifact-1' });

    const patch = { coverLetterStatus: StudioArtifactLifecycleStatus.COMPLETED } as any;

    const results = await Promise.allSettled([
      (service as any).upsertArtifactRow('u-1', 'b-1', 'j-1', patch, 'cover_letter'),
      (service as any).upsertArtifactRow('u-1', 'b-1', 'j-1', patch, 'cover_letter'),
    ]);

    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      expect(result.value).toBe('artifact-1');
    }

    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      '[studio-artifacts][persist_decision]',
      expect.objectContaining({ scopeKey: 'u-1:b-1:j-1', artifactType: 'cover_letter', decision: 'create' }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      '[studio-artifacts][persist_decision]',
      expect.objectContaining({ scopeKey: 'u-1:b-1:j-1', artifactType: 'cover_letter', decision: 'update' }),
    );

    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
