export type GapDomain = "experience" | "tooling" | "scope" | "leadership" | "industry";

export type GapConfidence = "low" | "medium" | "high";

export interface InterviewGap {
  gapId: string;
  domain: GapDomain;
  jdExcerpt: string;
  baselineExcerpt: string | null;
  confidence: GapConfidence;
}

export type InterviewQuestionCategory =
  | "Direct Experience"
  | "Context"
  | "Scope"
  | "Tooling"
  | "Impact";

export interface InterviewQuestion {
  gapId: string;
  category: InterviewQuestionCategory;
  prompt: string;
  jdReference: string;
}

export interface InterviewResponseDto {
  id: string;
  question: string;
  response: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewSessionDto {
  id: string;
  baselineId: string | null;
  baselineVersionId: string | null;
  jobId: string | null;
  status: string;
  gapList?: InterviewGap[];
  questions?: InterviewQuestion[];
  responses?: string[];
  validationResults?: Record<string, unknown>;
  recommendedAdditions?: string[];
  createdAt: string;
  updatedAt: string;
}
