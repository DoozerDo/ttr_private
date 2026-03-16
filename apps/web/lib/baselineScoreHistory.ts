export type BaselineScoreHistory = {
  first: number;
  latest: number;
};

export type BaselineScoreHistoryCardViewModel = {
  hasSuccessfulAnalysis: boolean;
  originalScore: number | null;
  currentScore: number | null;
  scoreDelta: number | null;
  scoreDeltaDirection: "up" | "down" | "flat" | null;
};

type AnalysisHistoryRecord = {
  baselineId: string;
  score: number | null;
  isSuccessful: boolean;
  createdAt: number;
};

function coerceString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

function parseCreatedAtMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function parseHistoryRecord(entry: unknown): AnalysisHistoryRecord | null {
  if (!entry || typeof entry !== "object") return null;

  const obj = entry as Record<string, unknown>;
  const baselineId = coerceString(obj.baselineId ?? obj.baseline_id);
  if (!baselineId) return null;

  const score =
    coerceNumber(obj.score) ??
    coerceNumber(obj.overallScore) ??
    coerceNumber(obj.compatibilityScore) ??
    coerceNumber(obj.fitScore) ??
    coerceNumber((obj.score_breakdown as { total_score?: unknown } | undefined)?.total_score);

  if (score === null) {
    return null;
  }

  const status = coerceString(obj.status)?.toLowerCase() ?? "";
  const hasSuccessStatus = status.includes("complete") || status.includes("success");
  const isSuccessful = status ? hasSuccessStatus : true;
  if (!isSuccessful) {
    return null;
  }

  return {
    baselineId,
    score,
    isSuccessful,
    createdAt: parseCreatedAtMs(obj.createdAt ?? obj.created_at),
  };
}

export function buildBaselineScoreHistoryMap(historyPayload: unknown): Record<string, BaselineScoreHistory> {
  const records = (Array.isArray(historyPayload) ? historyPayload : [])
    .map(parseHistoryRecord)
    .filter((record): record is AnalysisHistoryRecord => Boolean(record));

  const grouped = new Map<string, AnalysisHistoryRecord[]>();
  for (const record of records) {
    const existing = grouped.get(record.baselineId) ?? [];
    existing.push(record);
    grouped.set(record.baselineId, existing);
  }

  const output: Record<string, BaselineScoreHistory> = {};
  for (const [baselineId, baselineRecords] of grouped.entries()) {
    const ordered = [...baselineRecords].sort((a, b) => a.createdAt - b.createdAt);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (!first || !last) continue;

    output[baselineId] = {
      first: first.score ?? 0,
      latest: last.score ?? first.score ?? 0,
    };
  }

  return output;
}

export function toBaselineScoreHistoryCardViewModel(
  history: BaselineScoreHistory | null | undefined,
): BaselineScoreHistoryCardViewModel {
  if (!history) {
    return {
      hasSuccessfulAnalysis: false,
      originalScore: null,
      currentScore: null,
      scoreDelta: null,
      scoreDeltaDirection: null,
    };
  }

  const originalScore = history.first;
  const currentScore = history.latest;
  const scoreDelta = currentScore - originalScore;
  const scoreDeltaDirection = scoreDelta > 0 ? "up" : scoreDelta < 0 ? "down" : "flat";

  return {
    hasSuccessfulAnalysis: true,
    originalScore,
    currentScore,
    scoreDelta,
    scoreDeltaDirection,
  };
}
