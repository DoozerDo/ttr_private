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

type BaselineScoreHistorySource = {
  originalBaselineScore?: number | null;
  latestBaselineScore?: number | null;
};

export function buildBaselineScoreHistoryFromBaseline(
  baseline: BaselineScoreHistorySource | null | undefined,
): BaselineScoreHistory | null {
  if (!baseline) return null;

  const original =
    typeof baseline.originalBaselineScore === "number"
      ? baseline.originalBaselineScore
      : null;
  const latest =
    typeof baseline.latestBaselineScore === "number"
      ? baseline.latestBaselineScore
      : null;

  if (original === null && latest === null) {
    return null;
  }

  return {
    first: original ?? latest ?? 0,
    latest: latest ?? original ?? 0,
  };
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
