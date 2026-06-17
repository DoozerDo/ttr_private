import { StudioArtifactLifecycleStatus } from './studio-artifact.entity';
import { StudioArtifactsService } from './studio-artifacts.service';
import type { CustomerWorkflowState } from '../workflow/customer-workflow.service';

describe('StudioArtifactsService (unit): resumeResult contract', () => {
  const buildResult = (
    record: any,
  ): any => {
    const service = Object.create(StudioArtifactsService.prototype) as any;
    return service.buildCanonicalResultFromRecord('resume', record);
  };

  it('keeps persisted resume response state visible when the stored responseBody looks successful', () => {
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
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
      }),
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

  it('types the readState workflowState slot with the canonical CustomerWorkflowState shape', async () => {
    const studioArtifactRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'artifact-3',
        createdAt: new Date('2026-06-03T00:00:00.000Z'),
        updatedAt: new Date('2026-06-03T00:01:00.000Z'),
        resumeStatus: StudioArtifactLifecycleStatus.MISSING,
        resumeInputsHash: null,
        resumeResponseBody: null,
        resumeContent: null,
        resumeFailureCode: null,
        resumeFailureMessage: null,
        resumeGenerationStartedAt: null,
        resumeGeneratedAt: null,
        resumeFailedAt: null,
        resumeMetadata: {},
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
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
      }),
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

    const workflowState: CustomerWorkflowState | null | undefined = state.workflowState;
    expect(workflowState).toBeUndefined();
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

    expect(result.generationState).toBe('generated_unusable');
    expect(result.qualityStatus).toBe('pass');
    expect(result.preview).toBe(null);
  });

  it('reloads resume state from the persisted studio_artifacts resume field', async () => {
    const studioArtifactRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'artifact-1',
        createdAt: new Date('2026-06-03T00:00:00.000Z'),
        updatedAt: new Date('2026-06-03T00:01:00.000Z'),
        resumeStatus: StudioArtifactLifecycleStatus.COMPLETED,
        resumeInputsHash: 'resume-hash',
        resumeResponseBody: {
          status: 'success',
          generationStatus: 'success',
          exportReady: true,
          preview: {
            resume: { heading: { name: 'Persisted Resume' }, summary: 'From row' },
          },
        },
        resumeContent: 'persisted resume content',
        resumeFailureCode: null,
        resumeFailureMessage: null,
        resumeGenerationStartedAt: null,
        resumeGeneratedAt: new Date('2026-06-03T00:01:00.000Z'),
        resumeFailedAt: null,
        resumeMetadata: { analysisId: 'analysis-1' },
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
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
      }),
    } as any;
    const baselineVersionRepository = { findOne: jest.fn().mockResolvedValue({ id: 'base-version-1', baselineId: 'base-1', hash: 'hash-v1' }) } as any;
    const jobRepository = { findOne: jest.fn().mockResolvedValue({ id: 'job-1', title: 'Role', company: 'Co' }) } as any;
    const fitAssessmentRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ overallScore: 90, inputsHash: 'inputs-1' }),
      }),
    } as any;
    const baselineResumeV2BackfillService = { backfillLatestIfMissing: jest.fn().mockResolvedValue(null) } as any;

    const service = new StudioArtifactsService(
      studioArtifactRepository,
      baselineRepository,
      baselineVersionRepository,
      jobRepository,
      fitAssessmentRepository,
      baselineResumeV2BackfillService,
    );
    jest.spyOn(service as any, 'computeResumeInputsHash').mockReturnValue('resume-hash');
    jest.spyOn(service as any, 'computeCoverLetterInputsHash').mockReturnValue('cover-hash');

    const state = await service.readState({
      userId: 'u-1',
      baselineId: 'base-1',
      baselineVersionId: 'base-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    } as any);

    expect(state.resume?.responseBody?.preview?.resume).toEqual(
      expect.objectContaining({ summary: 'From row' }),
    );
    expect((state.resume as any)?.metadata?.analysisId).toBe('analysis-1');
    expect(state.resumeResult).toBeTruthy();
    expect((state.resumeResult as any)?.preview).toEqual(
      expect.objectContaining({ summary: 'From row' }),
    );
  });

  it('reloads cover letter state from the persisted studio_artifacts cover letter field', async () => {
    const studioArtifactRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'artifact-1',
        createdAt: new Date('2026-06-03T00:00:00.000Z'),
        updatedAt: new Date('2026-06-03T00:01:00.000Z'),
        resumeStatus: StudioArtifactLifecycleStatus.MISSING,
        resumeInputsHash: null,
        resumeResponseBody: null,
        resumeContent: null,
        resumeFailureCode: null,
        resumeFailureMessage: null,
        resumeGenerationStartedAt: null,
        resumeGeneratedAt: null,
        resumeFailedAt: null,
        resumeMetadata: {},
        coverLetterStatus: StudioArtifactLifecycleStatus.COMPLETED,
        coverLetterInputsHash: 'cover-hash',
        coverLetterResponseBody: {
          status: 'success',
          generationStatus: 'success',
          exportReady: true,
          preview: {
            coverLetter: { paragraphs: ['Persisted cover letter'] },
          },
        },
        coverLetterContent: 'persisted cover letter content',
        coverLetterFailureCode: null,
        coverLetterFailureMessage: null,
        coverLetterGenerationStartedAt: null,
        coverLetterGeneratedAt: new Date('2026-06-03T00:01:00.000Z'),
        coverLetterFailedAt: null,
        coverLetterMetadata: { analysisId: 'analysis-1' },
      } as any),
    } as any;
    const baselineRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
      }),
    } as any;
    const baselineVersionRepository = { findOne: jest.fn().mockResolvedValue({ id: 'base-version-1', baselineId: 'base-1', hash: 'hash-v1' }) } as any;
    const jobRepository = { findOne: jest.fn().mockResolvedValue({ id: 'job-1', title: 'Role', company: 'Co' }) } as any;
    const fitAssessmentRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ overallScore: 90, inputsHash: 'inputs-1' }),
      }),
    } as any;
    const baselineResumeV2BackfillService = { backfillLatestIfMissing: jest.fn().mockResolvedValue(null) } as any;

    const service = new StudioArtifactsService(
      studioArtifactRepository,
      baselineRepository,
      baselineVersionRepository,
      jobRepository,
      fitAssessmentRepository,
      baselineResumeV2BackfillService,
    );
    jest.spyOn(service as any, 'computeResumeInputsHash').mockReturnValue('resume-hash');
    jest.spyOn(service as any, 'computeCoverLetterInputsHash').mockReturnValue('cover-hash');

    const state = await service.readState({
      userId: 'u-1',
      baselineId: 'base-1',
      baselineVersionId: 'base-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    } as any);

    expect(state.coverLetter?.responseBody?.preview?.coverLetter).toEqual(
      expect.objectContaining({ paragraphs: ['Persisted cover letter'] }),
    );
    expect((state.coverLetter as any)?.metadata?.analysisId).toBe('analysis-1');
    expect(state.coverLetterResult).toBeTruthy();
    expect((state.coverLetterResult as any)?.preview).toEqual(
      expect.objectContaining({ paragraphs: ['Persisted cover letter'] }),
    );
  });

  it('reloads analysisId from persisted artifact metadata and not transient generation state', async () => {
    const studioArtifactRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'artifact-1',
        createdAt: new Date('2026-06-03T00:00:00.000Z'),
        updatedAt: new Date('2026-06-03T00:01:00.000Z'),
        resumeStatus: StudioArtifactLifecycleStatus.COMPLETED,
        resumeInputsHash: 'resume-hash',
        resumeResponseBody: { status: 'success', preview: { resume: { heading: {} } } },
        resumeContent: 'resume',
        resumeFailureCode: null,
        resumeFailureMessage: null,
        resumeGenerationStartedAt: null,
        resumeGeneratedAt: new Date('2026-06-03T00:01:00.000Z'),
        resumeFailedAt: null,
        resumeMetadata: { analysisId: 'analysis-1' },
        coverLetterStatus: StudioArtifactLifecycleStatus.COMPLETED,
        coverLetterInputsHash: 'cover-hash',
        coverLetterResponseBody: { status: 'success', preview: { coverLetter: { paragraphs: [] } } },
        coverLetterContent: 'cover',
        coverLetterFailureCode: null,
        coverLetterFailureMessage: null,
        coverLetterGenerationStartedAt: null,
        coverLetterGeneratedAt: new Date('2026-06-03T00:01:00.000Z'),
        coverLetterFailedAt: null,
        coverLetterMetadata: { analysisId: 'analysis-1' },
      } as any),
    } as any;
    const baselineRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
      }),
    } as any;
    const baselineVersionRepository = { findOne: jest.fn().mockResolvedValue({ id: 'base-version-1', baselineId: 'base-1', hash: 'hash-v1' }) } as any;
    const jobRepository = { findOne: jest.fn().mockResolvedValue({ id: 'job-1', title: 'Role', company: 'Co' }) } as any;
    const fitAssessmentRepository = { findOne: jest.fn().mockResolvedValue({ overallScore: 90, analysisId: 'transient-analysis' }) } as any;
    const baselineResumeV2BackfillService = { backfillLatestIfMissing: jest.fn().mockResolvedValue(null) } as any;

    const service = new StudioArtifactsService(
      studioArtifactRepository,
      baselineRepository,
      baselineVersionRepository,
      jobRepository,
      fitAssessmentRepository,
      baselineResumeV2BackfillService,
    );
    jest.spyOn(service as any, 'computeResumeInputsHash').mockReturnValue('resume-hash');
    jest.spyOn(service as any, 'computeCoverLetterInputsHash').mockReturnValue('cover-hash');

    const state = await service.readState({
      userId: 'u-1',
      baselineId: 'base-1',
      baselineVersionId: 'base-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    } as any);

    expect((state.resume as any)?.metadata?.analysisId).toBe('analysis-1');
    expect((state.coverLetter as any)?.metadata?.analysisId).toBe('analysis-1');
    expect((state.resumeResult as any)?.preview).toBeTruthy();
    expect((state.coverLetterResult as any)?.preview).toBeTruthy();
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
    expect(hydrated.artifactCurrent).toBe(true);
    expect(hydrated.usableCurrent).toBe(true);
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
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
      }),
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

  it('hydrates a fresh non-minimal resume payload from an equivalent normalized model even when preview.resume is absent and emits targeted resumeHydration diagnostics', async () => {
    const studioArtifactRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'c3696092-8b36-468e-b0f7-54e19e666ea4',
        createdAt: new Date('2026-06-04T00:00:00.000Z'),
        updatedAt: new Date('2026-06-04T00:01:00.000Z'),
        resumeStatus: StudioArtifactLifecycleStatus.COMPLETED,
        resumeInputsHash: 'hash-2',
        resumeResponseBody: {
          status: 'success',
          generationStatus: 'success',
          exportReady: false,
          internal: { resumeGenerationMode: 'baseline_verified_generation' },
          normalizedDocument: {
            heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
            summary: 'Recoverable normalized resume model.',
            experience: [{ company: 'Co', roleTitle: 'Role', bullets: ['Did work.'] }],
          },
          content: 'Resume content already persisted in responseBody.',
        },
        resumeContent: 'Resume content already persisted in record.',
        resumeFailureCode: null,
        resumeFailureMessage: null,
        resumeGenerationStartedAt: null,
        resumeGeneratedAt: new Date('2026-06-04T00:01:00.000Z'),
        resumeFailedAt: null,
        resumeMetadata: {},
        coverLetterStatus: StudioArtifactLifecycleStatus.COMPLETED,
        coverLetterInputsHash: 'hash-2',
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
        coverLetterGeneratedAt: new Date('2026-06-04T00:01:00.000Z'),
        coverLetterFailedAt: null,
        coverLetterMetadata: {},
      } as any),
    } as any;

    const baselineRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
      }),
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
    jest.spyOn(service as any, 'computeResumeInputsHash').mockReturnValue('hash-2');
    jest.spyOn(service as any, 'computeCoverLetterInputsHash').mockReturnValue('hash-2');

    const state = await service.readState({
      userId: 'u-1',
      baselineId: 'base-1',
      baselineVersionId: 'base-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    } as any);

    expect(state.resume?.responseBody).toBeTruthy();
    expect(String(state.resume?.content ?? '')).toContain('Resume content already persisted');
    expect(state.resume?.artifactCurrent).toBe(true);
    expect((state.diagnostics as any)?.resumeHydration).toBeTruthy();
    expect((state.diagnostics as any)?.resumeHydration?.loadedRecordId).toBe('c3696092-8b36-468e-b0f7-54e19e666ea4');
    expect((state.diagnostics as any)?.resumeHydration?.resumeRecordForResultBranchTaken).toBe('preserved_recoverable');
    expect((state.diagnostics as any)?.resumeHydration?.canonicalResumeResultPreviewPresent).toBe(true);
    expect(state.resumeResult).toBeTruthy();
    expect((state.resumeResult as any)?.preview).toBeTruthy();
    expect((state.resumeResult as any)?.preview?.heading?.name).toBe('Alex Candidate');
    expect((state.resumeResult as any)?.generationState).toBe('generated_needs_correction');
    expect((state.resumeResult as any)?.qualityStatus).toBe('needs_refinement');
    expect(state.coverLetterResult).toBeTruthy();
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
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
      }),
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
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
      }),
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

describe('StudioArtifactsService (unit): canonical generated artifact persistence', () => {
  function buildServiceWithRepo(repo: any) {
    return new StudioArtifactsService(
      repo,
      { findOne: jest.fn() } as any,
      { findOne: jest.fn() } as any,
      { findOne: jest.fn() } as any,
      { findOne: jest.fn() } as any,
      { backfillLatestIfMissing: jest.fn().mockResolvedValue(null) } as any,
    );
  }

  it('persists a canonical resume artifact row with baseline/job/analysis context and payload metadata', async () => {
    const insertExecute = jest.fn().mockResolvedValue({ raw: [{ id: 'artifact-resume-1' }] });
    const createQueryBuilder = jest.fn(() => ({
      insert: () => createQueryBuilder.mock.results[0].value,
      into: () => createQueryBuilder.mock.results[0].value,
      values: jest.fn((values) => {
        createQueryBuilder.mock.results[0].value.valuesArg = values;
        return createQueryBuilder.mock.results[0].value;
      }),
      onConflict: () => createQueryBuilder.mock.results[0].value,
      returning: () => createQueryBuilder.mock.results[0].value,
      execute: insertExecute,
      update: () => createQueryBuilder.mock.results[0].value,
      set: () => createQueryBuilder.mock.results[0].value,
      where: () => createQueryBuilder.mock.results[0].value,
    })) as any;
    const repo = { createQueryBuilder, findOne: jest.fn() } as any;
    const service = buildServiceWithRepo(repo);

    await service.recordResumeSuccess({
      userId: 'u-1',
      baselineId: 'b-1',
      jobId: 'j-1',
      baselineVersionId: 'bv-1',
      baselineVersionHash: 'hash-1',
      jobFingerprint: 'job-fp-1',
      inputsHash: 'inputs-1',
      analysisId: 'analysis-1',
      responseBody: {
        internalTrace: { usedEvidenceIds: ['e-1'] },
        preview: { resume: { heading: {}, summary: 'Supported summary from evidence.', summaryEvidenceIds: ['e-1'] } },
      },
      content: 'resume-content',
      metadata: { auditId: 'audit-1' },
    });

    expect(insertExecute).toHaveBeenCalled();
    expect((createQueryBuilder.mock.results[0].value as any).valuesArg).toMatchObject({
      userId: 'u-1',
      baselineId: 'b-1',
      jobId: 'j-1',
      resumeStatus: StudioArtifactLifecycleStatus.COMPLETED,
      resumeInputsHash: 'inputs-1',
      resumeContent: 'resume-content',
      resumeMetadata: expect.objectContaining({
        analysisId: 'analysis-1',
        auditId: 'audit-1',
      }),
    });
  });

  it('persists a canonical cover letter artifact row with baseline/job/analysis context and payload metadata', async () => {
    const insertExecute = jest.fn().mockResolvedValue({ raw: [{ id: 'artifact-cover-1' }] });
    const createQueryBuilder = jest.fn(() => ({
      insert: () => createQueryBuilder.mock.results[0].value,
      into: () => createQueryBuilder.mock.results[0].value,
      values: jest.fn((values) => {
        createQueryBuilder.mock.results[0].value.valuesArg = values;
        return createQueryBuilder.mock.results[0].value;
      }),
      onConflict: () => createQueryBuilder.mock.results[0].value,
      returning: () => createQueryBuilder.mock.results[0].value,
      execute: insertExecute,
      update: () => createQueryBuilder.mock.results[0].value,
      set: () => createQueryBuilder.mock.results[0].value,
      where: () => createQueryBuilder.mock.results[0].value,
    })) as any;
    const repo = { createQueryBuilder, findOne: jest.fn() } as any;
    const service = buildServiceWithRepo(repo);

    await service.recordCoverLetterSuccess({
      userId: 'u-1',
      baselineId: 'b-1',
      jobId: 'j-1',
      baselineVersionId: 'bv-1',
      baselineVersionHash: 'hash-1',
      jobFingerprint: 'job-fp-1',
      inputsHash: 'inputs-1',
      analysisId: 'analysis-1',
      responseBody: {
        internalTrace: { usedEvidenceIds: ['e-1'] },
        preview: { coverLetter: { paragraphs: ['I led support operations using evidence from my baseline.'] } },
        paragraphEvidence: [
          { paragraphKey: 'opening', paragraphText: 'I led support operations using evidence from my baseline.', sourceEvidenceIds: ['e-1'] },
        ],
      },
      content: 'cover-content',
      metadata: { auditId: 'audit-1' },
    });

    expect(insertExecute).toHaveBeenCalled();
    expect((createQueryBuilder.mock.results[0].value as any).valuesArg).toMatchObject({
      userId: 'u-1',
      baselineId: 'b-1',
      jobId: 'j-1',
      coverLetterStatus: StudioArtifactLifecycleStatus.COMPLETED,
      coverLetterInputsHash: 'inputs-1',
      coverLetterContent: 'cover-content',
      coverLetterMetadata: expect.objectContaining({
        analysisId: 'analysis-1',
        auditId: 'audit-1',
      }),
    });
  });

  it('persists resume and cover letter into the same canonical row for the same baseline/job/analysis context', async () => {
    const insertExecute = jest.fn()
      .mockResolvedValueOnce({ raw: [{ id: 'artifact-1' }] })
      .mockResolvedValueOnce({ raw: [] });
    const updateExecute = jest.fn().mockResolvedValue({ affected: 1 });
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({ id: 'artifact-1' })
      .mockResolvedValueOnce({
        id: 'artifact-1',
        resumeMetadata: { analysisId: 'analysis-1' },
        coverLetterMetadata: { analysisId: 'analysis-1' },
      });

    const insertBuilder = {
      insert: () => insertBuilder,
      into: () => insertBuilder,
      values: jest.fn(() => insertBuilder),
      onConflict: () => insertBuilder,
      returning: () => insertBuilder,
      execute: insertExecute,
    };
    const updateBuilder = {
      update: () => updateBuilder,
      set: jest.fn(() => updateBuilder),
      where: () => updateBuilder,
      execute: updateExecute,
    };
    const createQueryBuilder = jest
      .fn()
      .mockImplementationOnce(() => insertBuilder as any)
      .mockImplementationOnce(() => insertBuilder as any)
      .mockImplementationOnce(() => updateBuilder as any);
    const repo = { createQueryBuilder, findOne } as any;
    const service = buildServiceWithRepo(repo);

    const resumeId = await service.recordResumeSuccess({
      userId: 'u-1',
      baselineId: 'b-1',
      jobId: 'j-1',
      baselineVersionId: 'bv-1',
      baselineVersionHash: 'hash-1',
      jobFingerprint: 'job-fp-1',
      inputsHash: 'inputs-1',
      analysisId: 'analysis-1',
      responseBody: {
        internalTrace: { usedEvidenceIds: ['e-1'] },
        preview: { resume: { heading: {}, summary: 'Supported summary from evidence.', summaryEvidenceIds: ['e-1'] } },
      },
      content: 'resume-content',
      metadata: {},
    });

    const coverLetterId = await service.recordCoverLetterSuccess({
      userId: 'u-1',
      baselineId: 'b-1',
      jobId: 'j-1',
      baselineVersionId: 'bv-1',
      baselineVersionHash: 'hash-1',
      jobFingerprint: 'job-fp-1',
      inputsHash: 'inputs-1',
      analysisId: 'analysis-1',
      responseBody: {
        internalTrace: { usedEvidenceIds: ['e-1'] },
        preview: { coverLetter: { paragraphs: ['I led support operations using evidence from my baseline.'] } },
        paragraphEvidence: [
          { paragraphKey: 'opening', paragraphText: 'I led support operations using evidence from my baseline.', sourceEvidenceIds: ['e-1'] },
        ],
      },
      content: 'cover-content-1',
      metadata: {},
    });

    expect(resumeId).toBe('artifact-1');
    expect(coverLetterId).toBe('artifact-1');
    expect(updateExecute).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalled();
  });

  it('rejects repeated bullets across employers before marking resume current', async () => {
    const service = buildServiceWithRepo({ createQueryBuilder: jest.fn(), findOne: jest.fn() } as any);
    await expect(
      service.recordResumeSuccess({
        userId: 'u-1',
        baselineId: 'b-1',
        jobId: 'j-1',
        baselineVersionId: 'bv-1',
        baselineVersionHash: 'hash-1',
        jobFingerprint: 'job-fp-1',
        inputsHash: 'inputs-1',
        analysisId: 'analysis-1',
        responseBody: {
          internalTrace: { usedEvidenceIds: ['e-1'] },
          preview: {
            resume: {
              summary: 'Supported summary from evidence.',
              summaryEvidenceIds: ['e-1'],
              experience: [
                {
                  company: 'A',
                  roleTitle: 'Role',
                  bullets: [{ text: 'Improved service reliability.', sourceEvidenceIds: ['e-1'] }],
                },
                {
                  company: 'B',
                  roleTitle: 'Role',
                  bullets: [{ text: 'Improved service reliability.', sourceEvidenceIds: ['e-2'] }],
                },
              ],
            },
          },
        } as any,
        content: 'resume-content',
        metadata: {},
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'studio_artifact_evidence_contract_failed',
          blockers: expect.arrayContaining([
            expect.objectContaining({ code: 'resume_duplicate_bullet_across_employers' }),
          ]),
        },
      },
    });
  });

  it('rejects unsupported resume claims before marking resume current', async () => {
    const service = buildServiceWithRepo({ createQueryBuilder: jest.fn(), findOne: jest.fn() } as any);
    await expect(
      service.recordResumeSuccess({
        userId: 'u-1',
        baselineId: 'b-1',
        jobId: 'j-1',
        baselineVersionId: 'bv-1',
        baselineVersionHash: 'hash-1',
        jobFingerprint: 'job-fp-1',
        inputsHash: 'inputs-1',
        analysisId: 'analysis-1',
        responseBody: {
          internalTrace: { usedEvidenceIds: ['e-1'] },
          preview: {
            resume: {
              summary: 'Passionate leader driving synergy.',
              summaryEvidenceIds: ['e-1'],
              experience: [
                {
                  company: 'A',
                  roleTitle: 'Role',
                  bullets: [{ text: 'Delivered value.', sourceEvidenceIds: [] }],
                },
              ],
            },
          },
        } as any,
        content: 'resume-content',
        metadata: {},
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          blockers: expect.arrayContaining([
            expect.objectContaining({ code: 'resume_summary_unverified' }),
            expect.objectContaining({ code: 'resume_generic_filler' }),
          ]),
        },
      },
    });
  });

  it('rejects generic cover letter content before marking cover letter current', async () => {
    const service = buildServiceWithRepo({ createQueryBuilder: jest.fn(), findOne: jest.fn() } as any);
    await expect(
      service.recordCoverLetterSuccess({
        userId: 'u-1',
        baselineId: 'b-1',
        jobId: 'j-1',
        baselineVersionId: 'bv-1',
        baselineVersionHash: 'hash-1',
        jobFingerprint: 'job-fp-1',
        inputsHash: 'inputs-1',
        analysisId: 'analysis-1',
        responseBody: {
          internalTrace: { usedEvidenceIds: ['e-1'] },
          preview: {
            coverLetter: {
              paragraphs: ['I am a passionate team player who thrives in fast-paced environments.'],
            },
          },
          paragraphEvidence: [
            { paragraphKey: 'opening', paragraphText: 'I am a passionate team player who thrives in fast-paced environments.', sourceEvidenceIds: ['e-1'] },
          ],
        } as any,
        content: 'cover-content',
        metadata: {},
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          blockers: expect.arrayContaining([
            expect.objectContaining({ code: 'cover_letter_generic_filler' }),
          ]),
        },
      },
    });
  });

  it('persists evidence-backed resume and cover letter artifacts when the evidence contract passes', async () => {
    const insertExecute = jest.fn().mockResolvedValue({ raw: [{ id: 'artifact-1' }] });
    const createQueryBuilder = jest.fn(() => ({
      insert: () => createQueryBuilder.mock.results[0].value,
      into: () => createQueryBuilder.mock.results[0].value,
      values: jest.fn(() => createQueryBuilder.mock.results[0].value),
      onConflict: () => createQueryBuilder.mock.results[0].value,
      returning: () => createQueryBuilder.mock.results[0].value,
      execute: insertExecute,
      update: () => createQueryBuilder.mock.results[0].value,
      set: () => createQueryBuilder.mock.results[0].value,
      where: () => createQueryBuilder.mock.results[0].value,
    })) as any;
    const service = buildServiceWithRepo({ createQueryBuilder, findOne: jest.fn() } as any);

    await expect(
      service.recordResumeSuccess({
        userId: 'u-1',
        baselineId: 'b-1',
        jobId: 'j-1',
        baselineVersionId: 'bv-1',
        baselineVersionHash: 'hash-1',
        jobFingerprint: 'job-fp-1',
        inputsHash: 'inputs-1',
        analysisId: 'analysis-1',
        responseBody: {
          internalTrace: { usedEvidenceIds: ['e-1'] },
          preview: {
            resume: {
              summary: 'Led support operations across teams.',
              experience: [
                {
                  company: 'A',
                  roleTitle: 'Role',
                  bullets: [{ text: 'Improved service reliability.', sourceEvidenceIds: ['e-1'] }],
                },
              ],
            },
          },
        } as any,
        content: 'resume-content',
        metadata: {},
      }),
    ).resolves.toBe('artifact-1');

    await expect(
      service.recordCoverLetterSuccess({
        userId: 'u-1',
        baselineId: 'b-1',
        jobId: 'j-1',
        baselineVersionId: 'bv-1',
        baselineVersionHash: 'hash-1',
        jobFingerprint: 'job-fp-1',
        inputsHash: 'inputs-1',
        analysisId: 'analysis-1',
        responseBody: {
          internalTrace: { usedEvidenceIds: ['e-1'] },
          preview: {
            coverLetter: {
              paragraphs: ['I led support operations using evidence from my baseline.'],
            },
          },
          paragraphEvidence: [
            { paragraphKey: 'opening', paragraphText: 'I led support operations using evidence from my baseline.', sourceEvidenceIds: ['e-1'] },
          ],
        } as any,
        content: 'cover-content',
        metadata: {},
      }),
    ).resolves.toBe('artifact-1');
  });

  it('preserves analysisId on reloadable artifact state', async () => {
    const studioArtifactRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'artifact-1',
        createdAt: new Date('2026-06-03T00:00:00.000Z'),
        updatedAt: new Date('2026-06-03T00:01:00.000Z'),
        resumeStatus: StudioArtifactLifecycleStatus.COMPLETED,
        resumeInputsHash: 'hash-1',
        resumeResponseBody: {
          status: 'success',
          preview: { resume: { heading: { name: 'Alex' } } },
        },
        resumeContent: 'resume-content',
        resumeFailureCode: null,
        resumeFailureMessage: null,
        resumeGenerationStartedAt: null,
        resumeGeneratedAt: new Date('2026-06-03T00:01:00.000Z'),
        resumeFailedAt: null,
        resumeMetadata: { analysisId: 'analysis-1' },
        coverLetterStatus: StudioArtifactLifecycleStatus.COMPLETED,
        coverLetterInputsHash: 'hash-1',
        coverLetterResponseBody: {
          status: 'success',
          preview: { coverLetter: { paragraphs: [] } },
        },
        coverLetterContent: 'cover-content',
        coverLetterFailureCode: null,
        coverLetterFailureMessage: null,
        coverLetterGenerationStartedAt: null,
        coverLetterGeneratedAt: new Date('2026-06-03T00:01:00.000Z'),
        coverLetterFailedAt: null,
        coverLetterMetadata: { analysisId: 'analysis-1' },
      } as any),
    } as any;
    const baselineRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'base-1', userId: 'u-1', sections: [] }),
      }),
    } as any;
    const baselineVersionRepository = { findOne: jest.fn().mockResolvedValue({ id: 'base-version-1', baselineId: 'base-1', hash: 'hash-v1' }) } as any;
    const jobRepository = { findOne: jest.fn().mockResolvedValue({ id: 'job-1', title: 'Role', company: 'Co' }) } as any;
    const fitAssessmentRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ overallScore: 90, inputsHash: 'inputs-1' }),
      }),
    } as any;
    const baselineResumeV2BackfillService = { backfillLatestIfMissing: jest.fn().mockResolvedValue(null) } as any;

    const service = new StudioArtifactsService(
      studioArtifactRepository,
      baselineRepository,
      baselineVersionRepository,
      jobRepository,
      fitAssessmentRepository,
      baselineResumeV2BackfillService,
    );
    jest.spyOn(service as any, 'computeResumeInputsHash').mockReturnValue('hash-1');
    jest.spyOn(service as any, 'computeCoverLetterInputsHash').mockReturnValue('hash-1');

    const state = await service.readState({
      userId: 'u-1',
      baselineId: 'base-1',
      baselineVersionId: 'base-version-1',
      jobId: 'job-1',
      analysisId: 'analysis-1',
    } as any);

    expect((state.resume as any)?.metadata?.analysisId).toBe('analysis-1');
    expect((state.coverLetter as any)?.metadata?.analysisId).toBe('analysis-1');
  });
});
