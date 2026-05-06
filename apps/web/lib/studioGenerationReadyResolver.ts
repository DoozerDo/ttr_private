import type { GenerationReadiness } from "@/lib/generationReadiness";
import type { StudioArtifactFailurePresentation } from "@/src/lib/studio/helpers";
import type { WorkflowAuthorityPrimaryAction, WorkflowAuthorityState } from "@/lib/resolveWorkflowAuthority";

export type StudioGenerationReadyModel = {
  isGenerationReadyPriority: boolean;
  headline: string;
  body: string;
  primaryAction: {
    label: string;
    action: "generate_resume_and_cover";
  };
  secondaryAction?: {
    label: string;
    action: "open_workspace";
  };
  trustSummary?: {
    fitScore?: number | null;
    readinessState?: string | null;
    evidenceStatus?: string | null;
  };
};

type PairStatus = "missing" | "generating" | "generated" | "completed" | "failed" | string;

export function resolveStudioGenerationReadyModel(input: {
  postUnlockOutcomeState: "unlocked_ready" | string | null;
  workflowState: WorkflowAuthorityState;
  workflowPrimaryAction: WorkflowAuthorityPrimaryAction;
  readiness: GenerationReadiness;
  fitScore: number | null;
  pairStatus: PairStatus | null;
  hasAnyUsableOutput: boolean;
  hasBlockingAuthority: boolean;
  resumeFailure: StudioArtifactFailurePresentation | null;
  coverFailure: StudioArtifactFailurePresentation | null;
}): StudioGenerationReadyModel {
  const readinessIsReady = input.readiness.status === "ready" && !input.readiness.blocked;
  const normalizedPairStatus = (input.pairStatus ?? "").toLowerCase();
  const isGeneratedAlready = normalizedPairStatus === "generated" || normalizedPairStatus === "completed";
  const isGeneratingAlready = normalizedPairStatus === "generating" || normalizedPairStatus === "in_progress";
  const workflowSupportsImmediateGeneration =
    input.workflowState === "READY" && input.workflowPrimaryAction === "GENERATE";

  // Studio no longer shows an intermediate "generation ready" step. Score >= 80 renders artifact cards directly.
  const isGenerationReadyPriority = false;

  const evidenceStatus =
    input.readiness.blocked ? "Blocked" : readinessIsReady ? "Evidence blocker: Cleared" : "Evidence blocker: Unclear";

  return {
    isGenerationReadyPriority,
    headline: "Your documents are ready to generate.",
    body: "Your latest evidence cleared the blocker. Generate your tailored resume and cover letter now.",
    primaryAction: {
      label: "Generate resume and cover letter",
      action: "generate_resume_and_cover",
    },
    secondaryAction: {
      label: "Open workspace",
      action: "open_workspace",
    },
    trustSummary: {
      fitScore: input.fitScore,
      readinessState: readinessIsReady ? "Ready" : input.readiness.badgeLabel ?? null,
      evidenceStatus,
    },
  };
}
