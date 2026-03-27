export type OpportunityDriftStatus = "IMPROVED" | "DECLINED" | "UNCHANGED" | "UNKNOWN";

export type OpportunityDrift = {
  savedFitScore: number | null;
  currentFitScore: number | null;
  driftStatus: OpportunityDriftStatus;
  fitDelta: number | null;
  shouldShowUpdateMaterials: boolean;
};

function toScore(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.round(value);
}

export function deriveOpportunityDrift(input: {
  savedFitScore?: number | null;
  currentFitScore?: number | null;
  generationAllowed?: boolean;
}): OpportunityDrift {
  const savedFitScore = toScore(input.savedFitScore);
  const currentFitScore = toScore(input.currentFitScore);

  if (savedFitScore === null || currentFitScore === null) {
    return {
      savedFitScore,
      currentFitScore,
      driftStatus: "UNKNOWN",
      fitDelta: null,
      shouldShowUpdateMaterials: false,
    };
  }

  const fitDelta = currentFitScore - savedFitScore;
  const driftStatus: OpportunityDriftStatus =
    fitDelta > 0 ? "IMPROVED" : fitDelta < 0 ? "DECLINED" : "UNCHANGED";

  return {
    savedFitScore,
    currentFitScore,
    driftStatus,
    fitDelta,
    shouldShowUpdateMaterials: driftStatus === "IMPROVED" && Boolean(input.generationAllowed),
  };
}
