import { emitArtifactQualityTelemetry } from './artifactQualityTelemetry';

describe('artifactQualityTelemetry', () => {
  it('logs pass-first-try event and does not include generated content', () => {
    const log = jest.fn();

    emitArtifactQualityTelemetry(
      { log } as any,
      {
        artifactType: 'resume',
        baselineId: 'base-1',
        baselineVersionId: 'bv-1',
        jobId: 'job-1',
        analysisId: 'analysis-1',
        requestId: 'req-1',
      },
      {
        firstPass: { status: 'pass', reasons: [] },
        final: { status: 'pass', reasons: [] },
        repairAttempted: false,
      },
    );

    expect(log).toHaveBeenCalledTimes(1);
    const msg = String(log.mock.calls[0][0] ?? '');
    expect(msg).toContain('artifact_quality_pass_first_try');
    expect(msg).not.toContain('Designed and built');
    expect(msg).not.toContain('operating context');
    expect(msg).not.toContain('content');
    expect(msg).not.toContain('paragraphs');
    expect(msg).not.toContain('summary');
  });

  it('logs attempted + succeeded when repair turns needs_refinement into pass', () => {
    const log = jest.fn();

    emitArtifactQualityTelemetry(
      { log } as any,
      {
        artifactType: 'cover_letter',
        baselineId: 'base-1',
        baselineVersionId: 'bv-1',
        jobId: 'job-1',
        analysisId: null,
        requestId: 'req-1',
      },
      {
        firstPass: { status: 'needs_refinement', reasons: ["banned_phrase:'operating context'"] },
        final: { status: 'pass', reasons: [] },
        repairAttempted: true,
      },
    );

    expect(log).toHaveBeenCalledTimes(2);
    expect(String(log.mock.calls[0][0])).toContain('artifact_quality_repair_attempted');
    expect(String(log.mock.calls[1][0])).toContain('artifact_quality_repair_succeeded');
  });

  it('logs attempted + failed when still needs_refinement after repair', () => {
    const log = jest.fn();

    emitArtifactQualityTelemetry(
      { log } as any,
      {
        artifactType: 'resume',
        baselineId: 'base-1',
        baselineVersionId: 'bv-1',
        jobId: 'job-1',
        analysisId: 'analysis-1',
        requestId: 'req-1',
      },
      {
        firstPass: { status: 'needs_refinement', reasons: ['incomplete_trailing_fragment'] },
        final: { status: 'needs_refinement', reasons: ['incomplete_trailing_fragment'] },
        repairAttempted: true,
      },
    );

    expect(log).toHaveBeenCalledTimes(2);
    expect(String(log.mock.calls[0][0])).toContain('artifact_quality_repair_attempted');
    expect(String(log.mock.calls[1][0])).toContain('artifact_quality_repair_failed');
  });
});

