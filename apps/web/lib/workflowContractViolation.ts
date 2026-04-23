export type WorkflowContractViolation = {
  violationType:
    | "multiple_primary_authorities"
    | "generation_ready_conflicts_with_unlock"
    | "generation_ready_conflicts_with_post_unlock"
    | "stale_preview_rendered_while_suppressed"
    | "unknown_workflow_fallthrough";
  surface: "results" | "studio" | "unknown";
  canonicalState?: string | null;
  trustTone?: string | null;
  authorityFlags: {
    unlockActive: boolean;
    postUnlockActive: boolean;
    generationReadyActive: boolean;
    failureActive: boolean;
  };
  artifactFlags: {
    stalePreviewSuppressed: boolean;
    stalePreviewRendered: boolean;
    resumeState?: string | null;
    coverState?: string | null;
  };
  context?: Record<string, string | number | boolean | null>;
};

export function workflowContractViolationKey(violation: WorkflowContractViolation): string {
  const relevant = {
    violationType: violation.violationType,
    surface: violation.surface,
    canonicalState: violation.canonicalState ?? null,
    trustTone: violation.trustTone ?? null,
    authorityFlags: violation.authorityFlags,
    artifactFlags: {
      stalePreviewSuppressed: violation.artifactFlags.stalePreviewSuppressed,
      stalePreviewRendered: violation.artifactFlags.stalePreviewRendered,
      resumeState: violation.artifactFlags.resumeState ?? null,
      coverState: violation.artifactFlags.coverState ?? null,
    },
  };
  return JSON.stringify(relevant);
}

