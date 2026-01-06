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

export type RecommendedAdditionStatus = "proposed" | "accepted" | "rejected" | "deferred";

export type RecommendedAdditionSource = {
  gapId?: string;
  questionIndex?: number;
  questionPrompt?: string;
};

export interface RecommendedAddition {
  id: string;
  text: string;
  sources?: RecommendedAdditionSource[];
  status: RecommendedAdditionStatus;
}

export type RecommendedAdditionDecision = "accept" | "reject" | "defer";

export type AdditionDecisionPayload = {
  additionId: string;
  decision: RecommendedAdditionDecision;
};

export interface ExpandedFitAssessment {
  expandedScore?: number | null;
  originalScore?: number | null;
  delta?: number | null;
  originalVerdict?: string | null;
  expandedVerdict?: string | null;
  [key: string]: unknown;
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
  baselineVersionHash?: string | null;
  baselineVersion?: number | null;
  jobId: string | null;
  status: string;
  acceptedAdditionIds?: string[];
  promotedBaselineVersionId?: string | null;
  gapList?: InterviewGap[];
  questions?: InterviewQuestion[];
  responses?: string[];
  validationResults?: Record<string, unknown>;
  recommendedAdditions?: RecommendedAddition[];
  expandedFitAssessment?: ExpandedFitAssessment | null;
  createdAt: string;
  updatedAt: string;
}
