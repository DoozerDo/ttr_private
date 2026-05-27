export type WorkflowContractDecision = {
  baselineUsable: boolean;
  scoreAllowsGeneration: boolean;
  resumeGenerationAllowed: boolean;
  coverLetterGenerationAllowed: boolean;
  resumeArtifactRenderable: boolean;
  coverLetterArtifactRenderable: boolean;
  blockingReason: string | null;
};

export type WorkflowContractInput = {
  baselineUsable: boolean;
  score: number | null;
  hasRenderableResumeArtifact: boolean;
  hasRenderableCoverLetterArtifact: boolean;
};

export function resolveWorkflowContract(input: WorkflowContractInput): WorkflowContractDecision {
  const scoreAllowsGeneration = typeof input.score === "number" && Number.isFinite(input.score) && input.score >= 80;
  const resumeGenerationAllowed = Boolean(input.baselineUsable) && scoreAllowsGeneration;
  const coverLetterGenerationAllowed = Boolean(input.baselineUsable) && scoreAllowsGeneration;

  const baselineUsable = Boolean(input.baselineUsable);
  const resumeArtifactRenderable = Boolean(input.hasRenderableResumeArtifact);
  const coverLetterArtifactRenderable = Boolean(input.hasRenderableCoverLetterArtifact);

  const blockingReason = resumeGenerationAllowed
    ? null
    : !baselineUsable
      ? "baseline_unusable"
      : !scoreAllowsGeneration
        ? "score_below_generation_threshold"
        : "generation_blocked";

  return {
    baselineUsable,
    scoreAllowsGeneration,
    resumeGenerationAllowed,
    coverLetterGenerationAllowed,
    resumeArtifactRenderable,
    coverLetterArtifactRenderable,
    blockingReason,
  };
}

