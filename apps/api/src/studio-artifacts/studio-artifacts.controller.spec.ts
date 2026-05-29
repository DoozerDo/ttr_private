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

  it('returns a non-missing renderable resume payload even when exportReady is false (hydration contract)', async () => {
    const readState = jest.fn(async () => ({
      status: 'COMPLETED',
      baselineId,
      baselineVersionId,
      jobId,
      baselineVersionHash: 'hash-1',
      jobFingerprint: 'jobfp-1',
      generationContractVersion: 'studio-artifacts-v1',
      assessmentScore: 82,
      resume: {
        status: 'COMPLETED',
        inputsHash: 'resume-hash',
        inputsHashMatches: true,
        artifactCurrent: true,
        usableCurrent: true,
        retryAllowed: true,
        responseBody: {
          exportReady: false,
          exports: { docx: false, pdf: false },
          qualityGate: { status: 'pass', reasons: [] },
          preview: {
            resume: {
              heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
              summary: 'Support leader focused on scalable operations.',
              experience: [{ company: 'Acme', roleTitle: 'Ops Lead', bullets: ['Owned escalations.'] }],
            },
          },
        },
        content: 'Alex Candidate\nAcme\n- Owned escalations.',
        failureCode: null,
        failureMessage: null,
        startedAt: null,
        completedAt: new Date().toISOString(),
        failedAt: null,
        metadata: { auditId: 'audit-1' },
      },
      resumeResult: {
        artifactType: 'resume',
        generationState: 'generated_usable',
        qualityStatus: 'pass',
        qualityGate: { status: 'pass', reasons: [] },
        correctionReasons: [],
        exportReady: false,
        exports: { docx: false, pdf: false },
        preview: {
          heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
          summary: 'Support leader focused on scalable operations.',
          experience: [{ company: 'Acme', roleTitle: 'Ops Lead', bullets: ['Owned escalations.'] }],
        },
        actions: { canEdit: true, canRegenerate: true, canExport: false, canSaveToOpportunities: false },
      },
      coverLetter: null,
      coverLetterResult: null,
    }));

    const service = { readState } as any;
    const controller = new StudioArtifactsController(service);

    const result = await controller.getState(
      { user: { id: 'user-1' } } as any,
      baselineId,
      baselineVersionId,
      jobId,
      null,
    );

    expect((result as any)?.resume?.status).not.toBe('MISSING');
    expect((result as any)?.resumeResult?.preview ?? null).toBeTruthy();
    expect((result as any)?.resume?.responseBody?.preview?.resume ?? null).toBeTruthy();
  });
});
