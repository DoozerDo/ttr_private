export class GenerateCoverLetterDto {
  baselineId!: string;

  jobId!: string;

  closingTemplateKey?: string;

  maxWords?: number;

  tone?: string;
}
