import type { GenerationReadiness } from "@/lib/generationReadiness";

export type WorkflowAuthorityState = "READY" | "REVIEW_REQUIRED" | "BLOCKED" | "PARTIAL";
export type WorkflowAuthorityPrimaryAction = "GENERATE" | "RETRY" | "REVIEW" | "BLOCKED";

export type ResolveWorkflowAuthorityInput = {
  score: number | null;
  generationReadiness: GenerationReadiness;
  resumeState: { hasOutput: boolean; failed: boolean };
  coverState: { hasOutput: boolean; failed: boolean };
  isPro: boolean;
  hasGeneratedOnce: boolean;
  isHydrating: boolean;
};

export type WorkflowAuthorityResult = {
  workflowState: WorkflowAuthorityState;
  canGenerate: boolean;
  suppressFailureMessaging: boolean;
  primaryAction: WorkflowAuthorityPrimaryAction;
  headline: string;
  body: string;
  nextStepHint: string;
};

function normalizeScore(score: number | null): number | null {
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

export function resolveWorkflowAuthority(input: ResolveWorkflowAuthorityInput): WorkflowAuthorityResult {
  const score = normalizeScore(input.score);
  const hasAnyUsableOutput = Boolean(input.resumeState.hasOutput || input.coverState.hasOutput);
  const hasAnyFailures = Boolean(input.resumeState.failed || input.coverState.failed);
  const hasPartialFailure = hasAnyUsableOutput && hasAnyFailures;
  const reasonCodes = Array.isArray(input.generationReadiness.reasonCodes)
    ? input.generationReadiness.reasonCodes.map((c) => String(c ?? ""))
    : [];
  const hasBaselineResumeV2Blocker = reasonCodes.some((code) => code.startsWith("baseline_resume_v2_"));

  // Deterministic authority rules (single lane):
  // - Once any usable output exists, workflow is READY regardless of lifecycle turbulence.
  // - Otherwise, baseline ResumeV2 blockers are always BLOCKED (structural baseline authority).
  // - Otherwise, score >= 80 is READY (generate-now contract), even if readiness has blockers.
  // - Otherwise, readiness.blocked is BLOCKED.
  const workflowState: WorkflowAuthorityState = hasAnyUsableOutput
    ? "READY"
    : hasBaselineResumeV2Blocker
      ? "BLOCKED"
      : typeof score === "number" && score >= 80
        ? "READY"
        : input.generationReadiness.blocked
          ? "BLOCKED"
          : "REVIEW_REQUIRED";

  const canGenerate =
    typeof score === "number" &&
    score >= 70 &&
    (!input.generationReadiness.blocked || score >= 80) &&
    !hasBaselineResumeV2Blocker;
  const suppressFailureMessaging = hasAnyUsableOutput;

  const primaryAction: WorkflowAuthorityPrimaryAction =
    workflowState === "BLOCKED"
      ? "BLOCKED"
      : workflowState === "REVIEW_REQUIRED"
        ? "REVIEW"
        : hasAnyFailures
          ? "RETRY"
          : hasAnyUsableOutput
            ? "REVIEW"
            : "GENERATE";

  const headline =
    workflowState === "BLOCKED"
      ? "Generation is blocked"
      : workflowState === "REVIEW_REQUIRED"
        ? "Refine before you generate"
        : hasAnyUsableOutput
          ? "Your application is ready"
          : "Your application is being prepared";

  const body =
    workflowState === "BLOCKED"
      ? "Resolve the current blockers before continuing."
      : workflowState === "REVIEW_REQUIRED"
        ? "This role needs a tighter match before generation will be useful."
        : hasAnyUsableOutput
          ? "Review your generated materials and use the next step that fits this role."
          : "Your fit is strong enough to generate documents for this role.";

  const nextStepHint =
    primaryAction === "GENERATE"
      ? "Generate your documents to proceed."
      : primaryAction === "RETRY"
        ? "Retry generation to complete your materials."
        : primaryAction === "REVIEW"
          ? "Review and refine your fit before continuing."
          : "Resolve blockers before continuing.";

  if (process.env.NODE_ENV === "development") {
    // Dev-only: helps verify resolveWorkflowAuthority is the sole UI driver.
    console.debug("[workflowAuthority]", {
      workflowState,
      primaryAction,
      hasAnyUsableOutput,
      readinessBlocked: input.generationReadiness.blocked,
      score,
    });
  }

  // `isPro`, `hasGeneratedOnce`, and `isHydrating` are intentionally not used yet:
  // they are part of the stable input contract so future consolidation won't require
  // signature churn across Results/Studio.
  void input.isPro;
  void input.hasGeneratedOnce;
  void input.isHydrating;

  return { workflowState, canGenerate, suppressFailureMessaging, primaryAction, headline, body, nextStepHint };
}
