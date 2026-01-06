export class GenerateCoverLetterDto {
  baselineId!: string;

  baselineVersionId!: string;

  jobId!: string;

  closingTemplateKey?: string;

  maxWords?: number;

  tone?: string;
}
