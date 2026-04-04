export class RunExpandedFitAssessmentDto {
  jobId!: string;

  baselineId!: string;

  baselineVersion?: number;

  interviewId?: string;

  verifiedAdditions?: string[];
}
