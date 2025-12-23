export type AnalysisResult = {
  ok?: boolean;
  assessmentId?: string;
  jobId?: string;
  baselineId?: string;
  baselineVersion?: number | null;
  overallScore?: number;
  score: number;
  verdict?: "APPLY" | "CONSIDER" | "SKIP";
  dimensionScores?: {
    experienceAlignment: number;
    leadershipLevel: number;
    technicalPlatformFit: number;
    industryContext: number;
    strategicTacticalFit: number;
  };
  summary?: string;
  strengths?: string[];
  gaps?: string[];
  complianceFlags?:
    | string[]
    | {
        [key: string]: string | number | boolean | null | undefined;
      };
  recommendedActions?: string[];
  debug?: unknown;
};

export type StoredPayload = {
  result: AnalysisResult;
  savedAt: string;
};

const STORAGE_KEY = "ttr:lastAnalysis";

export async function saveLastAnalysis(payload: StoredPayload) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
