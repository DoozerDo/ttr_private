export type AnalysisResult = {
  ok?: boolean;
  baselineId?: string;
  score: number;
  summary?: string;
  strengths?: string[];
  gaps?: string[];
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
