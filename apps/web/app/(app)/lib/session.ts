// apps/web/app/(app)/lib/session.ts

export type AnalysisResult = {
  score: number | null;
  summary?: string;
  strengths?: string[];
  gaps?: string[];
  recommendedActions?: string[];
  baselineId?: string;
  jobId?: string;
  [key: string]: unknown;
};

export type StoredPayload = {
  result: AnalysisResult;
  savedAt: string;
};

const STORAGE_KEY = "ttr:lastAnalysis";

export function saveLastAnalysis(payload: StoredPayload) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}

export function normalizeAnalysisResult(raw: unknown): AnalysisResult {
  if (!raw || typeof raw !== "object") return { score: null };

  const obj = raw as Record<string, unknown>;

  const score =
    typeof obj.score === "number"
      ? obj.score
      : typeof obj.fit_score === "number"
        ? obj.fit_score
        : typeof obj.overall_score === "number"
          ? obj.overall_score
          : null;

  const summary = typeof obj.summary === "string" ? obj.summary : undefined;

  const strengths = Array.isArray(obj.strengths)
    ? obj.strengths.filter((x): x is string => typeof x === "string")
    : undefined;

  const gaps = Array.isArray(obj.gaps)
    ? obj.gaps.filter((x): x is string => typeof x === "string")
    : undefined;

  const recommendedActions = Array.isArray(obj.recommendedActions)
    ? obj.recommendedActions.filter((x): x is string => typeof x === "string")
    : undefined;

  const baselineId = typeof obj.baselineId === "string" ? obj.baselineId : undefined;
  const jobId = typeof obj.jobId === "string" ? obj.jobId : undefined;

  return {
    score,
    summary,
    strengths,
    gaps,
    recommendedActions,
    baselineId,
    jobId,
    ...obj,
  };
}
