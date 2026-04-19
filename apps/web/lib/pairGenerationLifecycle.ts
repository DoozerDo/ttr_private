import { shouldGenerateDocuments } from "@/lib/documentGenerationContract";
import type { PairWorkflowArtifactStatus } from "@/lib/pairWorkflowState";

export type PairGenerationPhase =
  | "not_started"
  | "eligible"
  | "starting"
  | "generating"
  | "partial"
  | "generated"
  | "failed";

export type PairGenerationLifecycleState = {
  phase: PairGenerationPhase;
  canStartGeneration: boolean;
  shouldPoll: boolean;
  isTerminal: boolean;
  retryAllowed: boolean;
  blockingReason: string | null;
};

export type ResolvePairGenerationLifecycleInput = {
  baselineId: string | null;
  jobId: string | null;
  score: number | null;
  resumeStatus: PairWorkflowArtifactStatus;
  coverLetterStatus: PairWorkflowArtifactStatus;
  kickoffInFlight?: boolean | null;
};

function hasContext(baselineId: string | null, jobId: string | null): boolean {
  return (
    typeof baselineId === "string" &&
    baselineId.trim().length > 0 &&
    typeof jobId === "string" &&
    jobId.trim().length > 0
  );
}

export function resolvePairGenerationLifecycle(
  input: ResolvePairGenerationLifecycleInput,
): PairGenerationLifecycleState {
  const contextOk = hasContext(input.baselineId, input.jobId);
  const score = typeof input.score === "number" && Number.isFinite(input.score) ? input.score : null;
  const eligible = contextOk && shouldGenerateDocuments(score);

  const resume = input.resumeStatus;
  const cover = input.coverLetterStatus;
  const anyGenerating = resume === "generating" || resume === "pending" || cover === "generating" || cover === "pending";
  const anyReady = resume === "ready" || cover === "ready";
  const anyFailed = resume === "failed" || cover === "failed";
  const bothReady = resume === "ready" && cover === "ready";
  const kickoffInFlight = Boolean(input.kickoffInFlight);

  let phase: PairGenerationPhase = "not_started";
  if (!contextOk) {
    phase = "not_started";
  } else if (bothReady) {
    phase = "generated";
  } else if (anyGenerating || kickoffInFlight) {
    phase = kickoffInFlight ? "starting" : "generating";
  } else if (anyReady && (resume === "missing" || cover === "missing" || anyFailed)) {
    phase = "partial";
  } else if (anyFailed) {
    phase = "failed";
  } else if (eligible) {
    phase = "eligible";
  } else {
    phase = "not_started";
  }

  const isTerminal = phase === "generated" || phase === "failed" || phase === "partial";
  const shouldPoll = phase === "starting" || phase === "generating";
  const retryAllowed = phase === "failed" || phase === "partial";
  const canStartGeneration = eligible && (phase === "eligible" || phase === "failed" || phase === "partial");

  const blockingReason =
    !contextOk
      ? "Select a baseline and role to generate documents."
      : !shouldGenerateDocuments(score)
        ? "Improve your fit before generating documents."
        : null;

  return {
    phase,
    canStartGeneration,
    shouldPoll,
    isTerminal,
    retryAllowed,
    blockingReason,
  };
}
