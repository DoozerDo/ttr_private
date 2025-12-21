// apps/web/app/lib/session.ts
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
  savedAt: string; // ISO string
};

export const STORAGE_KEY_LAST_ANALYSIS = "ttr:lastAnalysis";

export function saveLastAnalysis(payload: StoredPayload) {
  try {
    sessionStorage.setItem(STORAGE_KEY_LAST_ANALYSIS, JSON.stringify(payload));
  } catch {
    // no-op
  }
}

export function loadLastAnalysis(): StoredPayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_LAST_ANALYSIS);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredPayload;

    if (!parsed?.result) return null;
    if (typeof parsed.result.score !== "number") return null;
    if (typeof parsed.savedAt !== "string") return null;

    return parsed;
  } catch {
    return null;
  }
}

export function clearLastAnalysis() {
  try {
    sessionStorage.removeItem(STORAGE_KEY_LAST_ANALYSIS);
  } catch {
    // no-op
  }
}

export function formatLastUpdated(isoString: string) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "n/a";

  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}
