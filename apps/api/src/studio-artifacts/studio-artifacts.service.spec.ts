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

