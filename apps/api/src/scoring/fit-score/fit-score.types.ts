import { FitAssessmentVerdict } from '../../analysis/fit-assessment.entity';
import type { FitScoreVerdictLabel } from './fit-verdict';

export type FitScoreInput = {
  job: {
    title?: string | null;
    company?: string | null;
    rawDescription: string;
    normalizedResponsibilities: string[];
    normalizedRequirements: string[];
    sourceUrl?: string | null;
  };
  baseline: {
    version?: number | null;
    sections: Array<{ type?: string; content: string }>;
  };
  verifiedAdditions?: string[];
};

export type FitScoreDimensionScores = {
  experienceAlignment: number;
  leadershipLevel: number;
  technicalPlatformFit: number;
  industryContext: number;
  strategicTacticalFit: number;
};

export type DimensionWeightOverrides = Partial<Record<keyof FitScoreDimensionScores, number>>;

export type FitScoreDebugDimensionDetail = {
  score: number;
  semanticScore?: number;
  structuredScore?: number;
  keywordBoost?: number;
  fallbackScore?: number;
};

export type FitScoreDebugPayload = {
  weights: Record<keyof FitScoreDimensionScores, number>;
  rawScore: number;
  finalScore: number;
  signalBoost?: number;
  missingRequiredToolsCount: number;
  missingRequiredToolsPenalty: number;
  leadershipOverrideApplied: boolean;
  chosenTextSource: string;
  jobWordCount: number;
  baselineWordCount: number;
  verdict: FitScoreVerdictLabel;
  dimensionDetails: Record<keyof FitScoreDimensionScores, FitScoreDebugDimensionDetail>;
};

export type FitScoreResult = {
  overallScore: number;
  rawScore: number;
  verdict: FitScoreVerdictLabel;
  persistenceVerdict: FitAssessmentVerdict;
  dimensionScores: FitScoreDimensionScores;
  strengths: string[];
  gaps: string[];
  summary: string;
  missingRequiredTools: string[];
  missingRequiredToolsCount: number;
  missingRequiredToolsPenalty: number;
  leadershipOverrideApplied: boolean;
  complianceFlags: string[];
  debug?: FitScoreDebugPayload;
};

export type FitScoreOptions = {
  weights?: DimensionWeightOverrides | null;
  debug?: boolean;
};
