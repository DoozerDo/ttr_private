import { UnprocessableEntityException } from '@nestjs/common';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';

describe('ResumeController generation contract', () => {
  it('returns a typed generation_blocked outcome', async () => {
    const service = {
      generateResume: jest.fn().mockRejectedValue(
        new UnprocessableEntityException({
          code: 'generation_blocked',
          message:
            'Generation is not available for this role due to insufficient verified evidence.',
          blockers: [{ code: 'full_block', message: 'Missing verified evidence.' }],
        }),
      ),
    } as unknown as ResumeService;

    const controller = new ResumeController(service);

    await expect(
      controller.generateResume(
        {
          baselineId: 'baseline-1',
          baselineVersionId: 'version-1',
          jobId: 'job-1',
          analysisId: 'analysis-1',
        },
        { user: { id: 'user-1' } } as any,
      ),
    ).resolves.toMatchObject({
      status: 'error',
      code: 'generation_blocked',
      retryable: false,
      nextAction: 'review_results',
      artifactType: 'resume',
    });
  });

  it('preserves ArtifactFailure diagnostics in the serialized outcome payload', async () => {
    const service = {
      generateResume: jest.fn().mockRejectedValue(
        new UnprocessableEntityException({
          code: 'unsupported_input',
          category: 'unsupported_input',
          message: 'verified content was insufficient to build a valid resume structure',
          retryable: false,
          diagnostics: {
            fallbackPathExecuted: true,
            resumeFailureDiagnostics: {
              validationReason: 'resume_structure_empty',
              validationReasons: ['resume_structure_empty'],
              baselineEvidenceCount: 7,
              baselineExperienceSectionCount: 1,
              resumeV2ExperienceCount: 0,
              selectedEvidenceCount: 0,
            },
          },
        }),
      ),
    } as unknown as ResumeService;

    const controller = new ResumeController(service);

    await expect(
      controller.generateResume(
        {
          baselineId: 'baseline-1',
          baselineVersionId: 'version-1',
          jobId: 'job-1',
          analysisId: 'analysis-1',
        },
        { user: { id: 'user-1' } } as any,
      ),
    ).resolves.toMatchObject({
      status: 'error',
      code: 'unsupported_input',
      artifactType: 'resume',
      payload: {
        diagnostics: {
          fallbackPathExecuted: true,
          resumeFailureDiagnostics: {
            validationReason: 'resume_structure_empty',
          },
        },
      },
    });
  });
});

