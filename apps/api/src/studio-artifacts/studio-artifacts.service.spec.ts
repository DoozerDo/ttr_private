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
