import type { ArtifactGenerationResult } from "./artifactGenerationResult";

export type ReusableArtifactDecision = {
  reusable: boolean;
  reasons: string[];
  pipelineVersion: string | null;
  pipelineVersionMismatch: boolean;
};

function hasRealDocumentContractFailedReason(reasons: unknown): boolean {
  if (!Array.isArray(reasons)) return false;
  return reasons.some((reason) => {
    if (!reason || typeof reason !== "object") return false;
    const record = reason as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : "";
    return code.includes("real_document_contract_failed");
  });
}

export function isReusableGeneratedArtifact(
  artifact: Pick<
    ArtifactGenerationResult<unknown>,
    "generationState" | "exportReady" | "qualityStatus" | "correctionReasons"
  > | null,
  input?: {
    persistedPipelineVersion?: string | null;
    currentPipelineVersion?: string | null;
  },
): ReusableArtifactDecision {
  const reasons: string[] = [];
  const persistedPipelineVersion =
    typeof input?.persistedPipelineVersion === "string" ? input?.persistedPipelineVersion : null;
  const currentPipelineVersion =
    typeof input?.currentPipelineVersion === "string" ? input?.currentPipelineVersion : null;
  const pipelineVersionMismatch =
    Boolean(persistedPipelineVersion && currentPipelineVersion && persistedPipelineVersion !== currentPipelineVersion);
  if (pipelineVersionMismatch) reasons.push("pipeline_version_mismatch");

  if (!artifact) {
    reasons.push("missing_artifact_result");
    return { reusable: false, reasons, pipelineVersion: persistedPipelineVersion, pipelineVersionMismatch };
  }

  if (artifact.generationState !== "generated_usable") reasons.push("generation_state_not_generated_usable");
  if (artifact.exportReady !== true) reasons.push("export_ready_false");
  if (artifact.qualityStatus !== "pass") reasons.push("quality_gate_not_pass");
  if (hasRealDocumentContractFailedReason(artifact.correctionReasons)) reasons.push("real_document_contract_failed");

  const reusable =
    !pipelineVersionMismatch &&
    artifact.generationState === "generated_usable" &&
    artifact.exportReady === true &&
    artifact.qualityStatus === "pass" &&
    !hasRealDocumentContractFailedReason(artifact.correctionReasons);

  return { reusable, reasons, pipelineVersion: persistedPipelineVersion, pipelineVersionMismatch };
}

