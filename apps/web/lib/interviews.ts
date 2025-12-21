export interface InterviewResponseDto {
  id: string;
  question: string;
  response: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewSessionDto {
  id: string;
  baselineId: string;
  jobId: string | null;
  status: string;
  responses?: InterviewResponseDto[];
  createdAt: string;
  updatedAt: string;
}
