import type { GenerationProductReadiness } from "@/lib/generationProductReadiness";
import type { TrustGateDecision } from "@/lib/studioTrustGate";

type ArtifactFailureLike = { explanation?: string | null } | null | undefined;
type DocumentStateLike = {
  error?: string | null;
  artifactFailure?: ArtifactFailureLike;
};

export type StudioPrimaryTruthState =
  | "blocked_evidence"
  | "draftable_limited"
  | "ready"
  | "failed"
  | "generated_reviewable";

export type StudioPageTruth = {
  state: StudioPrimaryTruthState;
  isGenerating: boolean;
};

type BuildStudioPageTruthInput = {
  generationSupportState: "strong" | "partial" | "blocked";
  readiness?: GenerationProductReadiness | null;
  trustGate?: TrustGateDecision | null;
  hasCompletedGeneration: boolean;
  isGenerating: boolean;
  hasAnyArtifacts: boolean;
  resumeState: DocumentStateLike;
  coverState: DocumentStateLike;
};

export function buildStudioPageTruth(input: BuildStudioPageTruthInput): StudioPageTruth {
  if (input.hasAnyArtifacts) {
    if (input.isGenerating) {
      if (input.generationSupportState === "partial") {
        return { state: "draftable_limited", isGenerating: true };
      }
      return { state: "ready", isGenerating: true };
    }
    return { state: "generated_reviewable", isGenerating: false };
  }

  const hasArtifactFailure = Boolean(
    input.resumeState?.error ||
      input.coverState?.error ||
      input.resumeState?.artifactFailure?.explanation ||
      input.coverState?.artifactFailure?.explanation,
  );

  if (hasArtifactFailure) {
    return { state: "failed", isGenerating: false };
  }

  if (input.hasCompletedGeneration) {
    return { state: "generated_reviewable", isGenerating: false };
  }

  const blockedByTrust = input.trustGate ? !input.trustGate.allowed : false;
  const blockedByReadiness = input.readiness ? input.readiness.state === "BLOCKED" : false;

  if (input.generationSupportState === "blocked" || blockedByTrust || blockedByReadiness) {
    return { state: "blocked_evidence", isGenerating: false };
  }

  if (input.generationSupportState === "partial") {
    return { state: "draftable_limited", isGenerating: input.isGenerating };
  }

  return { state: "ready", isGenerating: input.isGenerating };
}
