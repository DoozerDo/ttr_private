import { StudioArtifactsController } from './studio-artifacts.controller';

describe('StudioArtifactsController (unit)', () => {
  const baselineId = '11111111-1111-4111-8111-111111111111';
  const baselineVersionId = '22222222-2222-4222-8222-222222222222';
  const jobId = '33333333-3333-4333-8333-333333333333';

  function makeController() {
    const readState = jest.fn(async () => ({
      status: 'MISSING',
      baselineId,
      baselineVersionId,
      jobId,
      baselineVersionHash: null,
      jobFingerprint: null,
      generationContractVersion: 'studio-artifacts-v1',
      assessmentScore: null,
      resume: null,
      coverLetter: null,
    }));

    const service = { readState } as any;
    const controller = new StudioArtifactsController(service);
    return { controller, readState };
  }

  it('returns 200 payload when analysisId is missing (no 422 wedge)', async () => {
    const { controller, readState } = makeController();

    const result = await controller.getState({ user: { id: 'user-1' } } as any, baselineId, baselineVersionId, jobId);

    expect(readState).toHaveBeenCalledWith({
      userId: 'user-1',
      baselineId,
      baselineVersionId,
      jobId,
      analysisId: null,
    });
    expect(result).toBeTruthy();
    expect((result as any).assessmentScore).toBe(null);
  });

  it('returns 422 when required ids are missing', async () => {
    const { controller } = makeController();

    await expect(controller.getState({ user: { id: 'user-1' } } as any, undefined, 'x', 'y')).rejects.toMatchObject({
      status: 422,
      response: { error: { code: 'studio_artifacts_missing_ids' } },
    });
    await expect(controller.getState({ user: { id: 'user-1' } } as any, 'x', undefined, 'y')).rejects.toMatchObject({
      status: 422,
      response: { error: { code: 'studio_artifacts_missing_ids' } },
    });
    await expect(controller.getState({ user: { id: 'user-1' } } as any, 'x', 'y', undefined)).rejects.toMatchObject({
      status: 422,
      response: { error: { code: 'studio_artifacts_missing_ids' } },
    });
  });

  it('returns 422 when analysisId is provided but invalid', async () => {
    const { controller } = makeController();

    await expect(
      controller.getState({ user: { id: 'user-1' } } as any, baselineId, baselineVersionId, jobId, 'not-a-uuid'),
    ).rejects.toMatchObject({
      status: 422,
      response: { error: { code: 'studio_artifacts_invalid_ids' } },
    });
  });
});
