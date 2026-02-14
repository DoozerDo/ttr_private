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

export type GapSimilarityRecord = {
  sectionId: string;
  similarity: number;
  hasEmbedding: boolean;
};

export type GapScoreRecord = {
  gapId: string;
  sectionId: string | null;
  vectorSimilarity: number;
  heuristicScore: number;
  finalScore: number;
};

export type GapDetectionDebug = {
  embeddingsUsed: boolean;
  jobEmbeddingAvailable: boolean;
  threshold: number;
  sectionSimilarities: GapSimilarityRecord[];
  gapScores: GapScoreRecord[];
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

export type RecommendedAdditionStatus =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'deferred';

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

export type RecommendedAdditionDecision = 'accept' | 'reject' | 'defer';

export type AdditionDecision = {
  additionId: string;
  decision: RecommendedAdditionDecision;
};

export type GapDetectionResult = {
  baselineId: string;
  baselineVersionId: string;
  jobId: string;
  debug?: GapDetectionDebug;
  gaps: InterviewGap[];
};
