// apps/web/app/(app)/lib/session.ts

export type AnalysisResult = {
  score: number | null;
  summary?: string;
  strengths?: string[];
  gaps?: string[];
  recommendedActions?: string[];
  baselineId?: string;
  jobId?: string;
  verdict?: string;
  assessmentId?: string;
  scoring_v2?: {
    score?: number | null;
    [key: string]: unknown;
  } | null;
  fit_score?: number;
  overall_score?: number;
  overallScore?: number;
  [key: string]: unknown;
};

export type JobSourceType = "saved" | "pasted" | "url" | "unknown";

export type JobSourceInfo = {
  type: JobSourceType;
  url?: string | null;
};

export type StoredAnalysisRecord = {
  savedAt: string;
  analysis: AnalysisResult;
  baselineId?: string;
  baselineVersionId?: string;
  jobId?: string;
  jobTitle?: string | null;
  company?: string | null;
  jobSource: JobSourceInfo;
  fitScore: number | null;
  summary?: string;
  verdict?: string | null;
};

const CURRENT_STORAGE_KEY = "ttr.lastAnalysis.v1";
const LEGACY_STORAGE_KEY = "ttr:lastAnalysis";

const DEFAULT_JOB_SOURCE: JobSourceInfo = { type: "unknown" };

function resolveFitScore(analysis: AnalysisResult): number | null {
  if (typeof analysis.scoring_v2?.score === "number") return analysis.scoring_v2.score;
  if (typeof analysis.score === "number") return analysis.score;
  if (typeof analysis.fit_score === "number") return analysis.fit_score;
  if (typeof analysis.overallScore === "number") return analysis.overallScore;
  if (typeof analysis.overall_score === "number") return analysis.overall_score;
  return null;
}

function normalizeRecord(raw: StoredAnalysisRecord): StoredAnalysisRecord {
  const resolvedFitScore = resolveFitScore(raw.analysis);
  return {
    ...raw,
    fitScore: resolvedFitScore ?? raw.fitScore ?? null,
    jobSource: raw.jobSource ?? DEFAULT_JOB_SOURCE,
  };
}

function parseStoredRecord(value: string): StoredAnalysisRecord | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StoredAnalysisRecord;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.analysis || typeof parsed.savedAt !== "string") return null;
    return normalizeRecord(parsed);
  } catch (error) {
    console.error("Unable to parse stored analysis", error);
    return null;
  }
}

function parseLegacyRecord(value: string): StoredAnalysisRecord | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { result?: AnalysisResult; savedAt?: string };
    if (!parsed?.result || !parsed.savedAt) return null;
    const analysis = parsed.result;
    const baselineId = typeof analysis.baselineId === "string" ? analysis.baselineId : undefined;
    const jobId = typeof analysis.jobId === "string" ? analysis.jobId : undefined;
    const record: StoredAnalysisRecord = {
      savedAt: parsed.savedAt,
      analysis,
      baselineId,
      jobId,
      summary: typeof analysis.summary === "string" ? analysis.summary : undefined,
      verdict: typeof analysis.verdict === "string" ? analysis.verdict : undefined,
      jobSource: DEFAULT_JOB_SOURCE,
      fitScore: resolveFitScore(analysis),
    };
    return record;
  } catch (error) {
    console.error("Unable to read legacy analysis", error);
    return null;
  }
}

function readFromStorage(storage: Storage, key: string): StoredAnalysisRecord | null {
  try {
    return parseStoredRecord(storage.getItem(key) ?? "");
  } catch {
    return null;
  }
}

export function saveLastAnalysis(record: StoredAnalysisRecord) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(CURRENT_STORAGE_KEY, JSON.stringify(normalizeRecord(record)));
  } catch {
    // ignore storage failures
  }
}

export function readLastAnalysis(): StoredAnalysisRecord | null {
  if (typeof window === "undefined") return null;

  if (typeof localStorage !== "undefined") {
    const stored = readFromStorage(localStorage, CURRENT_STORAGE_KEY);
    if (stored) return stored;
  }

  if (typeof sessionStorage !== "undefined") {
    const legacy = parseLegacyRecord(sessionStorage.getItem(LEGACY_STORAGE_KEY) ?? "");
    if (legacy) return legacy;
  }

  return null;
}

export const LAST_ANALYSIS_STORAGE_KEY = CURRENT_STORAGE_KEY;

export function normalizeAnalysisResult(raw: unknown): AnalysisResult {
  if (!raw || typeof raw !== "object") return { score: null };

  const obj = raw as Record<string, unknown>;

  const score =
    typeof obj.scoring_v2 === "object" &&
    obj.scoring_v2 !== null &&
    typeof (obj.scoring_v2 as { score?: unknown }).score === "number"
      ? (obj.scoring_v2 as { score: number }).score
      : typeof obj.score === "number"
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
