import type { PostUnlockOutcomeModel, PostUnlockReadiness } from "@/lib/postUnlockOutcomeModel";

export type { PostUnlockOutcomeModel, PostUnlockOutcomeState, PostUnlockReadiness } from "@/lib/postUnlockOutcomeModel";
export { formatPostUnlockDeltaSummary } from "@/lib/postUnlockOutcomeModel";

const MATERIAL_SCORE_DELTA = 2;

function readinessLabel(value: PostUnlockReadiness | null): string {
  if (!value) return "unknown";
  if (value === "ready") return "ready";
  if (value === "limited") return "limited";
  return "blocked";
}

function computeScoreDelta(priorScore: number | null, nextScore: number | null): number | null {
  if (typeof priorScore !== "number" || !Number.isFinite(priorScore)) return null;
  if (typeof nextScore !== "number" || !Number.isFinite(nextScore)) return null;
  const delta = nextScore - priorScore;
  return Number.isFinite(delta) ? delta : null;
}

function readinessImproved(prior: PostUnlockReadiness | null, next: PostUnlockReadiness | null): boolean {
  const order: Record<PostUnlockReadiness, number> = { blocked: 0, limited: 1, ready: 2 };
  if (!prior || !next) return false;
  return order[next] > order[prior];
}

function scoreImprovedMaterially(delta: number | null): boolean {
  return typeof delta === "number" && Number.isFinite(delta) && delta >= MATERIAL_SCORE_DELTA;
}

export function resolvePostUnlockOutcome(input: {
  reanalysisFailed: boolean;
  priorScore: number | null;
  newScore: number | null;
  priorReadiness: PostUnlockReadiness | null;
  newReadiness: PostUnlockReadiness | null;
  generationAllowedNow: boolean;
  returnToEvidenceHref: string;
}): PostUnlockOutcomeModel {
  const scoreDelta = computeScoreDelta(input.priorScore, input.newScore);
  const deltaSummary = {
    priorScore: input.priorScore,
    newScore: input.newScore,
    scoreDelta,
    priorReadiness: input.priorReadiness,
    newReadiness: input.newReadiness,
  };

  if (input.reanalysisFailed) {
    return {
      outcomeState: "reanalysis_failed",
      headline: "Re-evaluation failed.",
      body: "We couldn’t confirm whether your new evidence changed readiness. Retry the re-evaluation to refresh your score and gating state.",
      primaryCta: { label: "Try re-evaluating again", action: "retry_reanalysis" },
      secondaryCta: { label: "Add more evidence", href: input.returnToEvidenceHref, action: "return_to_evidence" },
      deltaSummary,
    };
  }

  if (input.generationAllowedNow || input.newReadiness === "ready") {
    return {
      outcomeState: "unlocked_ready",
      headline: "You’re unlocked. Generate your documents.",
      body: "Your readiness is now clear for generation in this role context.",
      primaryCta: { label: "Generate now", action: "start_generation" },
      secondaryCta: { label: "Continue in Studio", action: "dismiss" },
      deltaSummary,
    };
  }

  const improved =
    readinessImproved(input.priorReadiness, input.newReadiness) || scoreImprovedMaterially(scoreDelta);

  if (improved) {
    return {
      outcomeState: "improved_still_blocked",
      headline: "You made progress, but one blocker remains.",
      body: "Your update improved the assessment, but generation is still blocked. Add one more verified example for the remaining gap to unlock documents.",
      primaryCta: { label: "Add more evidence", href: input.returnToEvidenceHref, action: "return_to_evidence" },
      secondaryCta: { label: "Continue in Studio", action: "dismiss" },
      deltaSummary,
    };
  }

  return {
    outcomeState: "no_material_change",
    headline: "That update didn’t change your readiness yet.",
    body: `Re-evaluation completed, but readiness is still ${readinessLabel(input.newReadiness)}. Add a more specific, verified example tied to the missing evidence.`,
    primaryCta: { label: "Add more evidence", href: input.returnToEvidenceHref, action: "return_to_evidence" },
    secondaryCta: { label: "Try re-evaluating again", action: "retry_reanalysis" },
    deltaSummary,
  };
}
