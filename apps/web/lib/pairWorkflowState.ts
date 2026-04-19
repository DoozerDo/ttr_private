import type { CanonicalDecisionResult } from "@/lib/canonicalDecision";
import { shouldGenerateDocuments } from "@/lib/documentGenerationContract";

export type PairWorkflowPairStatus =
  | "missing_context"
  | "needs_analysis"
  | "analyzing"
  | "scored"
  | "ready_to_generate"
  | "generating"
  | "generated"
  | "generation_failed";

export type PairWorkflowArtifactStatus = "missing" | "pending" | "generating" | "ready" | "failed";

export type PairWorkflowPrimaryCtaType =
  | "fix_context"
  | "analyze"
  | "open_studio"
  | "generate"
  | "view_documents";

export type PairWorkflowState = {
  pairStatus: PairWorkflowPairStatus;
  score: number | null;
  canGenerate: boolean;
  primaryCta: PairWorkflowPrimaryCtaType;
  blockingReason: string | null;
  resumeStatus: PairWorkflowArtifactStatus;
  coverLetterStatus: PairWorkflowArtifactStatus;
};

type PairWorkflowArtifactsInput = {
  resume?: PairWorkflowArtifactStatus | null;
  coverLetter?: PairWorkflowArtifactStatus | null;
};

export type ResolvePairWorkflowStateInput = {
  baselineId: string | null;
  jobId: string | null;
  canonicalDecision: CanonicalDecisionResult;
  artifacts?: PairWorkflowArtifactsInput | null;
  analysisStatus?: "idle" | "running" | "failed" | "complete" | null;
};

function isNonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeArtifactStatus(value: PairWorkflowArtifactStatus | null | undefined): PairWorkflowArtifactStatus {
  if (value === "missing" || value === "pending" || value === "generating" || value === "ready" || value === "failed") {
    return value;
  }
  return "missing";
}

function derivePrimaryCta(input: {
  hasContext: boolean;
  hasScore: boolean;
  canGenerate: boolean;
  hasAnyArtifacts: boolean;
  anyArtifactReady: boolean;
  anyArtifactGenerating: boolean;
  anyArtifactFailed: boolean;
}): PairWorkflowPrimaryCtaType {
  if (!input.hasContext) return "fix_context";
  if (!input.hasScore) return "analyze";
  if (input.anyArtifactGenerating) return input.hasAnyArtifacts ? "view_documents" : "generate";
  if (input.anyArtifactFailed && !input.anyArtifactReady) return "generate";
  if (input.hasAnyArtifacts) return "view_documents";
  if (!input.canGenerate) return "open_studio";
  return "generate";
}

function derivePairStatus(input: {
  hasContext: boolean;
  analysisStatus?: ResolvePairWorkflowStateInput["analysisStatus"];
  hasScore: boolean;
  canGenerate: boolean;
  resume: PairWorkflowArtifactStatus;
  coverLetter: PairWorkflowArtifactStatus;
}): PairWorkflowPairStatus {
  if (!input.hasContext) return "missing_context";
  if (input.analysisStatus === "running") return "analyzing";
  if (!input.hasScore) return "needs_analysis";

  const hasAnyArtifacts = input.resume !== "missing" || input.coverLetter !== "missing";
  const anyGenerating = input.resume === "generating" || input.coverLetter === "generating";
  const anyFailed = input.resume === "failed" || input.coverLetter === "failed";
  const anyReady = input.resume === "ready" || input.coverLetter === "ready";

  if (anyGenerating) return "generating";
  if (anyReady) return "generated";
  if (anyFailed) return "generation_failed";
  if (input.canGenerate) return "ready_to_generate";
  return hasAnyArtifacts ? "scored" : "scored";
}

function deriveBlockingReason(input: {
  hasContext: boolean;
  hasScore: boolean;
  canonicalBlockingMessage: string | null;
  canGenerate: boolean;
  pairStatus: PairWorkflowPairStatus;
}): string | null {
  if (!input.hasContext) return "Select a baseline and role to continue.";
  if (!input.hasScore) return "Run fit assessment to score this pair.";
  if (!input.canGenerate && input.pairStatus === "scored") {
    return "Improve fit before generating documents.";
  }
  if (input.pairStatus === "generation_failed") {
    return input.canonicalBlockingMessage ?? "Generation failed. Review inputs and try again.";
  }
  return input.canonicalBlockingMessage;
}

export function resolvePairWorkflowState(input: ResolvePairWorkflowStateInput): PairWorkflowState {
  const score =
    typeof input.canonicalDecision.score === "number" && Number.isFinite(input.canonicalDecision.score)
      ? input.canonicalDecision.score
      : null;
  const hasContext = isNonEmpty(input.baselineId) && isNonEmpty(input.jobId);
  const hasScore = typeof score === "number";
  const canGenerate = shouldGenerateDocuments(score);
  const resumeStatus = normalizeArtifactStatus(input.artifacts?.resume ?? null);
  const coverLetterStatus = normalizeArtifactStatus(input.artifacts?.coverLetter ?? null);

  const pairStatus = derivePairStatus({
    hasContext,
    analysisStatus: input.analysisStatus ?? null,
    hasScore,
    canGenerate,
    resume: resumeStatus,
    coverLetter: coverLetterStatus,
  });

  const hasAnyArtifacts = resumeStatus !== "missing" || coverLetterStatus !== "missing";
  const anyArtifactReady = resumeStatus === "ready" || coverLetterStatus === "ready";
  const anyArtifactGenerating = resumeStatus === "generating" || coverLetterStatus === "generating";
  const anyArtifactFailed = resumeStatus === "failed" || coverLetterStatus === "failed";

  const primaryCta = derivePrimaryCta({
    hasContext,
    hasScore,
    canGenerate,
    hasAnyArtifacts,
    anyArtifactReady,
    anyArtifactGenerating,
    anyArtifactFailed,
  });

  const canonicalBlockingMessage =
    input.canonicalDecision.blockingReason?.message ??
    (input.canonicalDecision.workflowState === "studio_blocked_for_evidence"
      ? "Strengthen evidence to improve document quality."
      : null);

  const blockingReason = deriveBlockingReason({
    hasContext,
    hasScore,
    canonicalBlockingMessage,
    canGenerate,
    pairStatus,
  });

  return {
    pairStatus,
    score,
    canGenerate,
    primaryCta,
    blockingReason,
    resumeStatus,
    coverLetterStatus,
  };
}
