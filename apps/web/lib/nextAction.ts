import { resolveCanonicalState } from "@/lib/canonicalDecision";
import { getFitReviewHref, getStudioHref } from "@/src/navigation/routes";

export type NextActionType =
  | "fit_review"
  | "studio"
  | "studio_with_save";

export type NextActionInput = {
  fitScore: number | null;
  generationReady: boolean;
  trustGateAllowed: boolean;
  opportunityAlreadySaved?: boolean;
};

export type NextAction = {
  type: NextActionType;
  label: string;
  route: string;
  reason: string;
};

export function getCanonicalNextAction(input: NextActionInput): NextAction {
  const score = typeof input.fitScore === "number" && Number.isFinite(input.fitScore) ? input.fitScore : null;
  const generationReady = Boolean(input.generationReady && input.trustGateAllowed && (score === null || score >= 70));
  const canonical = resolveCanonicalState({
    surface: "studio",
    baselineId: null,
    jobId: null,
    score,
    generationReadiness: {
      status: generationReady ? "ready" : "blocked",
      blocked: !generationReady,
      reasonCodes: generationReady ? [] : ["generation_not_ready"],
      reasons: generationReady
        ? []
        : [{ code: "full_block", message: "generation not ready" }],
      badgeLabel: generationReady ? "READY" : "BLOCKED",
      summary: generationReady ? "Generation ready" : "Generation blocked",
      verificationIssues: [],
    },
    productReadiness: {
      generation_readiness: {
        canGenerate: generationReady,
        canExport: generationReady,
        reasonsBlocked: generationReady ? [] : ["trust_gate_blocked"],
      },
      state: generationReady ? "ALLOWED" : "BLOCKED",
      confidence: generationReady ? "HIGH" : "LOW",
      needsVerification: !input.trustGateAllowed,
      tier: generationReady ? "generation_allowed" : "fit_review_only",
      canOpenStudio: generationReady,
      generationMode: generationReady ? "verified" : "draft",
    },
    resultsHref: getStudioHref(),
    fitReviewHref: getFitReviewHref(),
    canGenerateDocuments: generationReady,
    opportunityAlreadySaved: input.opportunityAlreadySaved,
    scoreCandidates: [{ source: "primary", value: score }],
  });

  return {
    type: canonical.nextAction.type as NextActionType,
    label: canonical.nextAction.label,
    route: canonical.nextAction.route,
    reason: canonical.nextAction.reason,
  };
}

export function getPrimaryAction(input: NextActionInput | number): NextAction {
  if (typeof input === "number") {
    return getCanonicalNextAction({
      fitScore: input,
      generationReady: true,
      trustGateAllowed: true,
    });
  }
  return getCanonicalNextAction(input);
}

export function derivePrimaryNextAction(input: NextActionInput): NextAction {
  return getCanonicalNextAction(input);
}

export function getGenerationCompletionStorageKey(jobId?: string | null, baselineId?: string | null): string | null {
  const safeJobId = jobId?.trim() ?? "";
  const safeBaselineId = baselineId?.trim() ?? "";
  if (!safeJobId || !safeBaselineId) return null;
  return `ttr-generation-complete:${safeJobId}:${safeBaselineId}`;
}
