import type { GenerationReadiness, VerificationIssue } from "./generationReadiness";
import type { TierGateError } from "./tiers";
import { shouldGenerateDocuments } from "./documentGenerationContract";

export type StudioArtifactAccessState = "allowed" | "tier_gated";
export type StudioArtifactReadinessState = "ready" | "draft_only" | "blocked";
export type StudioArtifactGenerationState = "idle" | "generating" | "failed" | "complete";

export type StudioArtifactPrimaryBlocker =
  | "tier_gate"
  | "readiness_block"
  | "draft_only"
  | "generation_error"
  | "none";

export type StudioArtifactGating = {
  accessState: StudioArtifactAccessState;
  readinessState: StudioArtifactReadinessState;
  generationState: StudioArtifactGenerationState;
  primaryBlocker: StudioArtifactPrimaryBlocker;
  tierGateError: TierGateError | null;
};

export function isDraftAnywayEligible(
  score: number | null,
  gating: Pick<StudioArtifactGating, "accessState" | "readinessState">,
): boolean {
  return (
    shouldGenerateDocuments(score) &&
    gating.accessState === "allowed" &&
    (gating.readinessState === "blocked" || gating.readinessState === "draft_only")
  );
}

type ResolveInputs = {
  artifactType: "resume" | "cover_letter";
  readiness: GenerationReadiness;
  responsePresent: boolean;
  generating: boolean;
  hasFailure: boolean;
  tierGateError: TierGateError | null;
};

const hasBlockingIssueForArtifact = (
  artifactType: ResolveInputs["artifactType"],
  issue: VerificationIssue,
) => {
  if (issue.severity !== "block") return false;
  if (artifactType === "resume") return issue.source === "resume_generation";
  return issue.source === "cover_letter_generation";
};

function resolveReadinessState(inputs: ResolveInputs): StudioArtifactReadinessState {
  const { readiness, artifactType } = inputs;

  if (readiness.status === "blocked" || readiness.blocked) {
    const hasBlocker =
      readiness.verificationIssues?.some((issue) => hasBlockingIssueForArtifact(artifactType, issue)) ??
      false;
    if (hasBlocker) return "blocked";
  }

  if (readiness.status === "limited") {
    return "draft_only";
  }

  return "ready";
}

function resolveGenerationState(inputs: ResolveInputs): StudioArtifactGenerationState {
  if (inputs.responsePresent) return "complete";
  if (inputs.generating) return "generating";
  if (inputs.hasFailure) return "failed";
  return "idle";
}

export function resolveStudioArtifactGating(inputs: ResolveInputs): StudioArtifactGating {
  const accessState: StudioArtifactAccessState = inputs.tierGateError ? "tier_gated" : "allowed";
  const readinessState = resolveReadinessState(inputs);
  const generationState = resolveGenerationState(inputs);

  const primaryBlocker: StudioArtifactPrimaryBlocker =
    accessState === "tier_gated"
      ? "tier_gate"
      : readinessState === "blocked"
        ? "readiness_block"
        : readinessState === "draft_only"
          ? "draft_only"
          : generationState === "failed"
            ? "generation_error"
            : "none";

  return {
    accessState,
    readinessState,
    generationState,
    primaryBlocker,
    tierGateError: inputs.tierGateError,
  };
}
