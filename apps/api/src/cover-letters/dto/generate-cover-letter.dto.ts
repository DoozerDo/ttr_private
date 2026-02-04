import { DocumentType, JobApplicationContext } from '../../compliance/compliance.types';

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
}
