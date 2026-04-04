export type ReanalysisAnalysis = {
  assessmentId?: string | null;
  baselineVersionId?: string | null;
  overallScore?: number | null;
  score?: number | null;
  score_breakdown?: {
    total_score?: number | null;
  } | null;
  strengths?: string[] | null;
};

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function hasBaselineUpdated(
  analysis: Pick<ReanalysisAnalysis, "baselineVersionId"> | null,
  currentBaselineVersionId: string | null,
): boolean {
  const analysisBaselineVersionId = normalizeId(analysis?.baselineVersionId);
  const currentVersionId = normalizeId(currentBaselineVersionId);
  if (!analysisBaselineVersionId || !currentVersionId) return false;
  return analysisBaselineVersionId !== currentVersionId;
}

export function resolveAnalysisScore(analysis: ReanalysisAnalysis | null): number | null {
  if (!analysis) return null;
  const breakdownScore = analysis.score_breakdown?.total_score;
  if (typeof breakdownScore === "number") return breakdownScore;
  if (typeof analysis.overallScore === "number") return analysis.overallScore;
  if (typeof analysis.score === "number") return analysis.score;
  return null;
}

function normalizeSignal(signal: string): string {
  return signal.trim().toLowerCase();
}

function uniqueSignals(signals: string[] | null | undefined): string[] {
  if (!Array.isArray(signals)) return [];
  return Array.from(
    new Set(
      signals
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );
}

export function buildSignalDelta(
  previousSignals: string[] | null | undefined,
  currentSignals: string[] | null | undefined,
): { newSignals: string[]; lostSignals: string[] } {
  const previous = uniqueSignals(previousSignals);
  const current = uniqueSignals(currentSignals);
  const previousSet = new Set(previous.map(normalizeSignal));
  const currentSet = new Set(current.map(normalizeSignal));

  const newSignals = current.filter((signal) => !previousSet.has(normalizeSignal(signal)));
  const lostSignals = previous.filter((signal) => !currentSet.has(normalizeSignal(signal)));

  return { newSignals, lostSignals };
}

export function buildScoreDelta(
  previousAnalysis: ReanalysisAnalysis | null,
  currentAnalysis: ReanalysisAnalysis | null,
): {
  previousScore: number | null;
  currentScore: number | null;
  delta: number | null;
  newSignals: string[];
  lostSignals: string[];
  noImprovement: boolean;
} {
  const previousScore = resolveAnalysisScore(previousAnalysis);
  const currentScore = resolveAnalysisScore(currentAnalysis);
  const delta =
    typeof previousScore === "number" && typeof currentScore === "number"
      ? currentScore - previousScore
      : null;
  const { newSignals, lostSignals } = buildSignalDelta(previousAnalysis?.strengths, currentAnalysis?.strengths);
  const noImprovement =
    delta === 0 || (newSignals.length === 0 && lostSignals.length === 0);

  return {
    previousScore,
    currentScore,
    delta,
    newSignals,
    lostSignals,
    noImprovement,
  };
}

