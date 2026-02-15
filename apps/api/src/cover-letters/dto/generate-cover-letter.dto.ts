import { DocumentType, JobApplicationContext } from '../../compliance/compliance.types';
import { CoverLetterComplianceConstraints } from '../types/cover-letter-compliance-constraints';

export class GenerateCoverLetterDto {
  baselineId!: string;

  baselineVersionId!: string;

  jobId!: string;

  jobContext?: JobApplicationContext;

  documentType?: DocumentType;

  documentTypeKey?: string;

  closingTemplateKey?: string;

  maxWords?: number;

  tone?: string;
  complianceConstraints?: CoverLetterComplianceConstraints;
}
