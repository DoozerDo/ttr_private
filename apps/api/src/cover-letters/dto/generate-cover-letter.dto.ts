import { DocumentType, JobApplicationContext } from '../../compliance/compliance.types';
import { CoverLetterComplianceConstraints } from '../types/cover-letter-compliance-constraints';
import type { DocumentStrategyPlanLike } from '../../document-strategy-plan.types';

export class GenerateCoverLetterDto {
  baselineId!: string;

  baselineVersionId!: string;

  jobId!: string;

  analysisId!: string;

  jobContext?: JobApplicationContext;

  documentType?: DocumentType;

  documentTypeKey?: string;

  closingTemplateKey?: string;

  maxWords?: number;

  tone?: string;
  complianceConstraints?: CoverLetterComplianceConstraints;
  documentStrategyPlan?: DocumentStrategyPlanLike;
}
