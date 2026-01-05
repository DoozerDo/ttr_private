export type GapDomain =
  | 'experience'
  | 'tooling'
  | 'scope'
  | 'leadership'
  | 'industry';

export type GapConfidence = 'low' | 'medium' | 'high';

export type InterviewGap = {
  gapId: string;
  domain: GapDomain;
  jdExcerpt: string;
  baselineExcerpt: string | null;
  confidence: GapConfidence;
};

export type InterviewQuestionCategory =
  | 'Direct Experience'
  | 'Context'
  | 'Scope'
  | 'Tooling'
  | 'Impact';

export type InterviewQuestion = {
  gapId: string;
  category: InterviewQuestionCategory;
  prompt: string;
  jdReference: string;
};

export type RecommendedAdditionStatus = 'proposed' | 'accepted' | 'rejected';

export type RecommendedAdditionSource = {
  gapId?: string;
  questionIndex?: number;
  questionPrompt?: string;
};

export type RecommendedAddition = {
  id: string;
  text: string;
  sources: RecommendedAdditionSource[];
  status: RecommendedAdditionStatus;
};

export type GapDetectionResult = {
  baselineId: string;
  baselineVersionId: string;
  jobId: string;
  gaps: InterviewGap[];
};
