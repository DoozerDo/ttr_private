export type ArtifactType = "resume" | "cover_letter";

export type ArtifactGenerationState =
  | "not_started"
  | "generating"
  | "generated_usable"
  | "generated_needs_correction"
  | "generated_unusable"
  | "generation_failed";

export type ArtifactQualityStatus = "pass" | "needs_refinement" | "failed" | "blocked";

export type ArtifactCorrectionReason = {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
};

export type ArtifactGenerationActions = {
  canEdit: boolean;
  canRegenerate: boolean;
  canExport: boolean;
  canSaveToOpportunities: boolean;
};

export type ArtifactGenerationResult<TPreview> = {
  artifactType: ArtifactType;
  generationState: ArtifactGenerationState;
  qualityStatus: ArtifactQualityStatus;
  preview: TPreview | null;
  correctionReasons: ArtifactCorrectionReason[];
  exportReady: boolean;
  exports: { docx: boolean; pdf: boolean };
  actions: ArtifactGenerationActions;
};

function makeBaseResult<TPreview>(input: {
  artifactType: ArtifactType;
  generationState: ArtifactGenerationState;
  qualityStatus: ArtifactQualityStatus;
  preview: TPreview | null;
  correctionReasons: ArtifactCorrectionReason[];
  exportReady: boolean;
  exports: { docx: boolean; pdf: boolean };
  actions: ArtifactGenerationActions;
}): ArtifactGenerationResult<TPreview> {
  return {
    artifactType: input.artifactType,
    generationState: input.generationState,
    qualityStatus: input.qualityStatus,
    preview: input.preview,
    correctionReasons: input.correctionReasons,
    exportReady: input.exportReady,
    exports: input.exports,
    actions: input.actions,
  };
}

export function makeGeneratedUsableResult<TPreview>(input: {
  artifactType: ArtifactType;
  preview: TPreview;
  exports?: { docx: boolean; pdf: boolean };
  actions?: Partial<ArtifactGenerationActions>;
}): ArtifactGenerationResult<TPreview> {
  const exports = input.exports ?? { docx: true, pdf: true };
  return makeBaseResult({
    artifactType: input.artifactType,
    generationState: "generated_usable",
    qualityStatus: "pass",
    preview: input.preview,
    correctionReasons: [],
    exportReady: true,
    exports,
    actions: {
      canEdit: true,
      canRegenerate: true,
      canExport: true,
      canSaveToOpportunities: true,
      ...input.actions,
    },
  });
}

export function makeGeneratedNeedsCorrectionResult<TPreview>(input: {
  artifactType: ArtifactType;
  qualityStatus: Exclude<ArtifactQualityStatus, "pass">;
  preview: TPreview | null;
  correctionReasons: ArtifactCorrectionReason[];
  actions?: Partial<ArtifactGenerationActions>;
}): ArtifactGenerationResult<TPreview> {
  return makeBaseResult({
    artifactType: input.artifactType,
    generationState: "generated_needs_correction",
    qualityStatus: input.qualityStatus,
    preview: input.preview,
    correctionReasons: input.correctionReasons,
    exportReady: false,
    exports: { docx: false, pdf: false },
    actions: {
      canEdit: true,
      canRegenerate: true,
      canExport: false,
      canSaveToOpportunities: false,
      ...input.actions,
    },
  });
}

export function makeGeneratedUnusableResult<TPreview>(input: {
  artifactType: ArtifactType;
  qualityStatus: Exclude<ArtifactQualityStatus, "pass">;
  preview: TPreview | null;
  correctionReasons: ArtifactCorrectionReason[];
  actions?: Partial<ArtifactGenerationActions>;
}): ArtifactGenerationResult<TPreview> {
  return makeBaseResult({
    artifactType: input.artifactType,
    generationState: "generated_unusable",
    qualityStatus: input.qualityStatus,
    preview: input.preview,
    correctionReasons: input.correctionReasons,
    exportReady: false,
    exports: { docx: false, pdf: false },
    actions: {
      canEdit: true,
      canRegenerate: true,
      canExport: false,
      canSaveToOpportunities: false,
      ...input.actions,
    },
  });
}

export function makeGenerationFailedResult<TPreview>(input: {
  artifactType: ArtifactType;
  correctionReasons: ArtifactCorrectionReason[];
  actions?: Partial<ArtifactGenerationActions>;
}): ArtifactGenerationResult<TPreview> {
  return makeBaseResult<TPreview>({
    artifactType: input.artifactType,
    generationState: "generation_failed",
    qualityStatus: "failed",
    preview: null,
    correctionReasons: input.correctionReasons,
    exportReady: false,
    exports: { docx: false, pdf: false },
    actions: {
      canEdit: false,
      canRegenerate: true,
      canExport: false,
      canSaveToOpportunities: false,
      ...input.actions,
    },
  });
}
