export type CanonicalCoverLetterExportReadinessInput = {
  qualityStatus: string | null | undefined;
  qualityGateStatus: string | null | undefined;
  hasCanonicalDocument: boolean;
};

export type CanonicalCoverLetterExportReadiness = {
  exportReady: boolean;
  exports: {
    docx: boolean;
    pdf: boolean;
  };
};

export function resolveCanonicalCoverLetterExportReadiness(
  input: CanonicalCoverLetterExportReadinessInput,
): CanonicalCoverLetterExportReadiness {
  const exportReady =
    input.qualityStatus === 'pass' &&
    input.qualityGateStatus === 'pass' &&
    input.hasCanonicalDocument;

  return {
    exportReady,
    exports: {
      docx: exportReady,
      pdf: exportReady,
    },
  };
}
