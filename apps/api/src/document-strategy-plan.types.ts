export type DocumentStrategyFitBand = "strong" | "moderate" | "borderline" | null;

export type DocumentQualityFramingStrength = "high" | "medium" | "low";

export type DocumentQualityEmphasisConfidence = "high" | "medium" | "low";

export type DocumentQualityPass = {
  framingStrength: DocumentQualityFramingStrength;
  emphasisConfidence: DocumentQualityEmphasisConfidence;
  topNarrativeAxes: string[];
  cutCandidates: string[];
  mustLeadWith: string[];
  avoidRepeating: string[];
  coverLetterDelta: string[];
};

export type DocumentStrategyRoleLens = {
  titleFamily: string | null;
  seniority: string | null;
  scope: string | null;
  domainContext: string | null;
  priorities: string[];
  requiredSignals: string[];
  targetKeywords: string[];
};

export type DocumentStrategyEvidence = {
  baselineSection: string;
  sourceId: string;
  matchedSignals: string[];
  whySelected: string;
  approvedClaims: string[];
  rank?: number;
  score?: number;
};

export type DocumentStrategyPlanLike = {
  fitScore?: number | null;
  fitBand?: DocumentStrategyFitBand;
  positioningFrame?: string;
  roleLens?: {
    titleFamily?: string | null;
    seniority?: string | null;
    scope?: string | null;
    domainContext?: string | null;
    priorities?: string[];
    requiredSignals?: string[];
    targetKeywords?: string[];
  };
  selectedEvidence?: DocumentStrategyEvidence[];
  summaryStrategy?: string;
  resumeEmphasis?: string[];
  coverLetterThemes?: string[];
  suppressionNotes?: string[];
  qualityPass?: Partial<DocumentQualityPass> | null;
  documentQualityScore?: number;
};

