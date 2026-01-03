export class CreateInterviewRecordDto {
  jobId!: string;
  gapList?: string[];
  questions?: string[];
  responses?: string[];
  validationResults?: Record<string, unknown>;
  recommendedAdditions?: string[];
}
