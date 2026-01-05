import { InterviewGap, InterviewQuestion, RecommendedAddition } from '../interview-types';

export class UpdateInterviewRecordDto {
  jobId?: string;
  baselineId?: string;
  baselineVersionId?: string;
  gapList?: InterviewGap[];
  questions?: InterviewQuestion[];
  responses?: string[];
  validationResults?: Record<string, unknown>;
  recommendedAdditions?: RecommendedAddition[];
}
