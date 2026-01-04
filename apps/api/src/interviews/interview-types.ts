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

export type GapDetectionResult = {
  baselineId: string;
  baselineVersionId: string;
  jobId: string;
  gaps: InterviewGap[];
};
