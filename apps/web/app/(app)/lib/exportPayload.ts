export type ExportDocumentType = "resume" | "cover_letter" | "COVER_LETTER";

export type CanonicalExportFields = {
  documentType: ExportDocumentType;
  oneTap: boolean;
  jobId?: string;
  baselineId?: string;
  baselineVersionId?: string;
  analysisId?: string;
};

export type CanonicalExportPayload = CanonicalExportFields & Record<string, unknown>;

export type ExportJobContext = {
  allowedCompanies?: string[];
  allowedRoleTitles?: string[];
};

export type BuildExportPayloadInput = {
  documentType: ExportDocumentType;
  oneTap: boolean;
  jobId?: string | null;
  baselineId?: string | null;
  baselineVersionId?: string | null;
  analysisId?: string | null;
  extra?: Record<string, unknown>;
};

export function buildExportPayload(input: BuildExportPayloadInput): CanonicalExportPayload {
  const payload: CanonicalExportPayload = {
    documentType: input.documentType,
    oneTap: input.oneTap,
  };

  const jobId = input.jobId?.trim() ?? "";
  if (jobId) payload.jobId = jobId;

  const baselineId = input.baselineId?.trim() ?? "";
  if (baselineId) payload.baselineId = baselineId;

  const baselineVersionId = input.baselineVersionId?.trim() ?? "";
  if (baselineVersionId) payload.baselineVersionId = baselineVersionId;

  const analysisId = input.analysisId?.trim() ?? "";
  if (analysisId) payload.analysisId = analysisId;

  if (input.extra) {
    for (const [key, value] of Object.entries(input.extra)) {
      if (value !== undefined) {
        payload[key] = value;
      }
    }
  }

  return payload;
}
