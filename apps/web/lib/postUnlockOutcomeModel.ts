export type PostUnlockReadiness = "ready" | "limited" | "blocked";

export type PostUnlockOutcomeState =
  | "unlocked_ready"
  | "improved_still_blocked"
  | "no_material_change"
  | "reanalysis_failed";

export type PostUnlockOutcomeModel = {
  outcomeState: PostUnlockOutcomeState;
  headline: string;
  body: string;
  primaryCta: {
    label: string;
    href?: string;
    action?: "retry_reanalysis" | "return_to_evidence" | "start_generation";
  };
  secondaryCta?: {
    label: string;
    href?: string;
    action?: string;
  };
  deltaSummary?: {
    priorScore: number | null;
    newScore: number | null;
    scoreDelta: number | null;
    priorReadiness: PostUnlockReadiness | null;
    newReadiness: PostUnlockReadiness | null;
  };
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readinessLabel(value: PostUnlockReadiness | null): string {
  if (!value) return "unknown";
  if (value === "ready") return "ready";
  if (value === "limited") return "limited";
  return "blocked";
}

function formatScore(value: number | null): string {
  return isFiniteNumber(value) ? value.toFixed(0) : "unknown";
}

export function formatPostUnlockDeltaSummary(delta: PostUnlockOutcomeModel["deltaSummary"]): string {
  if (!delta) return "";
  const scoreLine = `Fit score moved from ${formatScore(delta.priorScore)} to ${formatScore(delta.newScore)}${
    typeof delta.scoreDelta === "number" ? ` (${delta.scoreDelta >= 0 ? "+" : ""}${delta.scoreDelta.toFixed(0)})` : ""
  }.`;
  const readinessLine = `Readiness changed from ${readinessLabel(delta.priorReadiness)} to ${readinessLabel(delta.newReadiness)}.`;
  return `${scoreLine} ${readinessLine}`;
}

