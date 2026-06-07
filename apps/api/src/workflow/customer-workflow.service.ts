import { Injectable } from '@nestjs/common';

export const CUSTOMER_WORKFLOW_STEPS = [
  'resume_uploaded',
  'verified_baseline_created',
  'job_analyzed',
  'fit_score_calculated',
  'resume_generated',
  'cover_letter_generated',
  'artifacts_persisted',
  'studio_reload_shows_both',
] as const;

export type CustomerWorkflowStep = (typeof CUSTOMER_WORKFLOW_STEPS)[number];

export type CustomerWorkflowState = {
  currentStep: CustomerWorkflowStep;
  completedSteps: CustomerWorkflowStep[];
  blockedStep?: CustomerWorkflowStep | null;
  artifactId?: string | null;
  resumeArtifactId?: string | null;
  coverLetterArtifactId?: string | null;
};

@Injectable()
export class CustomerWorkflowService {
  getWorkflowSteps(): readonly CustomerWorkflowStep[] {
    return CUSTOMER_WORKFLOW_STEPS;
  }
}
