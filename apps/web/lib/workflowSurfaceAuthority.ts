import type { GenerationReadiness } from "@/lib/generationReadiness";
import type { WorkflowAuthorityResult } from "@/lib/resolveWorkflowAuthority";
import type { PostUnlockOutcomeState } from "@/lib/postUnlockOutcomeModel";
import type { WorkflowSurfaceAuthorityModel, WorkflowSurfaceCanonicalState } from "@/lib/workflowSurfaceAuthorityModel";

export type {
  WorkflowSurfaceAuthorityModel,
  WorkflowSurfaceCanonicalState,
  WorkflowSurfacePrimaryDestination,
  WorkflowSurfaceTrustTone,
} from "@/lib/workflowSurfaceAuthorityModel";

type PairStatus = "missing" | "generating" | "generated" | "completed" | "failed" | "generation_failed" | string;

export function resolveWorkflowSurfaceAuthority(input: {
  score: number | null;
  generationReadiness: GenerationReadiness;
  workflowAuthority: Pick<WorkflowAuthorityResult, "workflowState" | "primaryAction">;
  artifact: {
    hasResume: boolean;
    hasCoverLetter: boolean;
    pairStatus?: PairStatus | null;
    generating?: boolean;
    failure?: { category?: string | null; retryable?: boolean | null } | null;
  };
  unlockContext?: { active: boolean; hasMissingEvidence: boolean } | null;
  postUnlockOutcomeState?: PostUnlockOutcomeState | null;
}): WorkflowSurfaceAuthorityModel {
  const score = typeof input.score === "number" && Number.isFinite(input.score) ? input.score : null;
  // "limited" with `blocked=false` is a warning lane, not a hard blocker.
  // If workflow authority says READY+GENERATE, we allow generation in this lane.
  const readinessStatus = input.generationReadiness.status;
  const readinessIsReady =
    (readinessStatus === "ready" || readinessStatus === "limited") && !input.generationReadiness.blocked;

  const hasResume = Boolean(input.artifact.hasResume);
  const hasCoverLetter = Boolean(input.artifact.hasCoverLetter);
  const hasAnyOutput = hasResume || hasCoverLetter;

  const normalizedPairStatus = String(input.artifact.pairStatus ?? "").toLowerCase();
  const pairGenerating =
    input.artifact.generating ||
    normalizedPairStatus === "generating" ||
    normalizedPairStatus === "in_progress";
  const pairFailed =
    normalizedPairStatus === "failed" ||
    normalizedPairStatus === "generation_failed";

  const unlockFlowActive = Boolean(input.unlockContext?.active && input.unlockContext?.hasMissingEvidence);
  const blocked = Boolean(input.generationReadiness.blocked || input.workflowAuthority.workflowState === "BLOCKED");

  const workflowSupportsImmediateGeneration =
    input.workflowAuthority.workflowState === "READY" && input.workflowAuthority.primaryAction === "GENERATE";
  const eligibleForGenerationReady =
    !unlockFlowActive &&
    !input.postUnlockOutcomeState &&
    // Product rule: score >= 80 means generation is allowed. Readiness is informational only and must
    // not gate Studio generation entry/auto-start.
    workflowSupportsImmediateGeneration &&
    !hasAnyOutput &&
    !pairGenerating &&
    !pairFailed;

  if (unlockFlowActive) {
    return {
      canonicalState: "unlock_required",
      headline: "One focused update is required.",
      body: "Add the missing verified experience to unlock document generation.",
      primaryAction: {
        label: "Add missing experience now",
        destination: "studio_unlock",
      },
      secondaryAction: { label: "Back to Results", destination: "results" },
      trustTone: "recovery",
    };
  }

  if (input.postUnlockOutcomeState) {
    const state = input.postUnlockOutcomeState;
    if (state === "unlocked_ready") {
      return {
        canonicalState: "post_unlock_outcome",
        headline: "Generate in Studio",
        body: "Your latest evidence cleared the blocker. Generate your tailored resume and cover letter in Studio.",
        primaryAction: {
          label: "Generate resume and cover letter",
          destination: "studio_generate",
        },
        secondaryAction: { label: "Open workspace", destination: "studio_workspace" },
        trustTone: "ready",
      };
    }
    if (state === "reanalysis_failed") {
      return {
        canonicalState: "post_unlock_outcome",
        headline: "Re-evaluation failed.",
        body: "We couldn't confirm whether your new evidence changed readiness. Retry the re-evaluation to refresh your score and gating state.",
        primaryAction: {
          label: "Try re-evaluating again",
          destination: "studio_workspace",
        },
        secondaryAction: { label: "Back to Results", destination: "results" },
        trustTone: "failure",
      };
    }
    return {
      canonicalState: "post_unlock_outcome",
      headline: "One focused update is required.",
      body: "You're close, but one blocker remains. Add one more verified example to unlock document generation.",
      primaryAction: {
        label: "Add missing experience now",
        destination: "studio_unlock",
      },
      secondaryAction: { label: "Open workspace", destination: "studio_workspace" },
      trustTone: "recovery",
    };
  }

  if (pairGenerating && !blocked) {
    return {
      canonicalState: "generation_in_progress",
      headline: "Generating your documents...",
      body: "We're building your tailored resume and cover letter now.",
      primaryAction: { label: "Open workspace", destination: "studio_workspace" },
      trustTone: "in_progress",
    };
  }

  if (!blocked && eligibleForGenerationReady) {
    return {
      canonicalState: "generation_ready",
      headline: "Generate in Studio",
      body: "Generate your tailored resume and cover letter directly in Studio.",
      primaryAction: {
        label: "Generate resume and cover letter",
        destination: "studio_generate",
      },
      secondaryAction: { label: "Open workspace", destination: "studio_workspace" },
      trustTone: "ready",
    };
  }

  if (hasAnyOutput) {
    const canonicalState: WorkflowSurfaceCanonicalState =
      hasResume && hasCoverLetter ? "documents_ready" : "partial_documents";

    if (canonicalState === "partial_documents") {
      const headline = "Complete your application";
      const body = hasResume
        ? "Your resume is ready. Generate and review your cover letter to finish your application."
        : "Your cover letter is ready. Generate and review your resume to finish your application.";
      const primaryLabel = hasResume ? "Complete cover letter" : "Complete resume";

      return {
        canonicalState,
        headline,
        body,
        primaryAction: { label: primaryLabel, destination: "studio_workspace" },
        secondaryAction: { label: "Back to Results", destination: "results" },
        trustTone: "recovery",
      };
    }

    return {
      canonicalState,
      headline: "Your tailored documents are ready.",
      body: "Your resume and cover letter are ready. Apply now or open Studio to review, refine, and export.",
      primaryAction: { label: "Apply to this role", destination: "studio_workspace" },
      trustTone: "complete",
    };
  }

  if (pairFailed || input.artifact.failure) {
    const retryable =
      Boolean(input.artifact.failure?.retryable) || normalizedPairStatus === "generation_failed";
    return {
      canonicalState: "generation_failed",
      headline: "Document generation failed.",
      body: "Generation didn't complete from the current inputs. Retry generation, or return to evidence to clear the blocker.",
      primaryAction: retryable
        ? { label: "Retry generation", destination: "studio_generate" }
        : { label: "Fix evidence gaps", destination: "fit_review" },
      secondaryAction: { label: "Open workspace", destination: "studio_workspace" },
      trustTone: "failure",
    };
  }

  if (blocked) {
    return {
      canonicalState: "hard_blocked",
      headline: "Generation is blocked.",
      body: "Resolve the evidence blocker to unlock document generation.",
      primaryAction: { label: "Fix evidence gaps", destination: "fit_review" },
      secondaryAction: { label: "Back to Results", destination: "results" },
      trustTone: "blocked",
    };
  }

  // Fit Review recovery band: treat as unlock-required (single-lane).
  if (typeof score === "number" && score >= 70 && score <= 84) {
    return {
      canonicalState: "unlock_required",
      headline: "One focused update is required.",
      body: "Add one specific, verified example to unlock document generation.",
      primaryAction: { label: "Add missing experience now", destination: "studio_unlock" },
      secondaryAction: { label: "Back to Results", destination: "results" },
      trustTone: "recovery",
    };
  }

  return {
    canonicalState: "unlock_required",
    headline: "One focused update is required.",
    body: "Add missing verified experience to unlock document generation.",
    primaryAction: { label: "Fix evidence gaps", destination: "fit_review" },
    secondaryAction: { label: "Back to Results", destination: "results" },
    trustTone: "recovery",
  };
}
