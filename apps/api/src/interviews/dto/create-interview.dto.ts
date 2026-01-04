export class CreateInterviewRecordDto {
  jobId!: string;
  baselineId?: string;
  baselineVersionId!: string;
  gapList?: unknown[];
  questions?: unknown[];
  responses?: unknown[];
  validationResults?: Record<string, unknown>;
  recommendedAdditions?: unknown[];
}
