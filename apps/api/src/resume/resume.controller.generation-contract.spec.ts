import { UnprocessableEntityException } from '@nestjs/common';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';
import {
  CUSTOMER_WORKFLOW_STEPS,
  type CustomerWorkflowState,
} from '../workflow/customer-workflow.service';
import { CustomerWorkflowService } from '../workflow/customer-workflow.service';

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

  it('models the full customer workflow state shape across the canonical eight steps', () => {
    const workflowState = {
      currentStep: 'studio_reload_shows_both',
      completedSteps: [...CUSTOMER_WORKFLOW_STEPS],
      resumeArtifactId: 'resume-artifact-1',
      coverLetterArtifactId: 'cover-artifact-1',
    } satisfies CustomerWorkflowState;

    expect(workflowState.completedSteps).toEqual(CUSTOMER_WORKFLOW_STEPS);
    expect(workflowState.completedSteps).toHaveLength(CUSTOMER_WORKFLOW_STEPS.length);
    expect(new Set(workflowState.completedSteps).size).toBe(CUSTOMER_WORKFLOW_STEPS.length);
    expect(workflowState.currentStep).toBe('studio_reload_shows_both');
  });

  it('exposes the canonical workflow vocabulary from the CustomerWorkflowService owned module', () => {
    const workflowService = new CustomerWorkflowService();
    expect(workflowService.getWorkflowSteps()).toEqual(CUSTOMER_WORKFLOW_STEPS);
  });
});
