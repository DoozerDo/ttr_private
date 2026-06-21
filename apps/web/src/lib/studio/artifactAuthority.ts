type StudioArtifactsRecordLike = {
  responseBody?: unknown;
  content?: string | null;
  artifactId?: unknown;
} | null;

type StudioArtifactsPayloadLike = {
  resume?: StudioArtifactsRecordLike;
  coverLetter?: StudioArtifactsRecordLike;
  resumeArtifactHydration?: {
    resumeArtifactId?: unknown;
  } | null;
} | null;

export type PersistedArtifactExistence = {
  hasResumeArtifactPersisted: boolean;
  hasCoverLetterArtifactPersisted: boolean;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function hasNonEmptyText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptyPayload(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value !== "object") return true;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value as Record<string, unknown>).length > 0;
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || String(value ?? "").toLowerCase() === "true";
}

function hasHydratedResumeArtifact(normalizedArtifacts: StudioArtifactsPayloadLike): boolean {
  const resumeArtifactId = normalizedArtifacts?.resumeArtifactHydration?.resumeArtifactId;
  const resumeRecordArtifactId = normalizedArtifacts?.resume?.artifactId;
  return (
    (typeof resumeArtifactId === "string" && resumeArtifactId.trim().length > 0) ||
    (typeof resumeRecordArtifactId === "string" && resumeRecordArtifactId.trim().length > 0)
  );
}

function isMinimalResumeArtifact(resume: StudioArtifactsRecordLike): boolean {
  const responseBody = toRecord(resume?.responseBody);
  if (!responseBody) return false;

  const internal = toRecord(responseBody.internal);
  const auditId = String(responseBody.auditId ?? responseBody.audit_id ?? "").trim();
  const internalAuditId = String(internal?.auditId ?? internal?.audit_id ?? "").trim();
  const generationMode = String(internal?.resumeGenerationMode ?? "").trim();

  return (
    auditId.startsWith("minimal:") ||
    internalAuditId.startsWith("minimal:") ||
    generationMode === "top_level_fail_safe_minimal" ||
    isTruthyFlag(internal?.minimalFallback) ||
    isTruthyFlag(internal?.resumeFailSafeMinimalUsed)
  );
}

function isSuccessfulHydratedResumeArtifact(resume: StudioArtifactsRecordLike): boolean {
  const responseBody = toRecord(resume?.responseBody);
  if (!responseBody) return false;

  const status = String(responseBody.status ?? "").trim().toLowerCase();
  const generationStatus = String(responseBody.generationStatus ?? "").trim().toLowerCase();
  const exportReady = responseBody.exportReady === true;

  return status === "success" && generationStatus === "success" && exportReady;
}

export function getArtifactExistence(normalizedArtifacts: StudioArtifactsPayloadLike): PersistedArtifactExistence {
  const resume = normalizedArtifacts?.resume ?? null;
  const coverLetter = normalizedArtifacts?.coverLetter ?? null;

  const hasRenderableResumeArtifact =
    (!isMinimalResumeArtifact(resume) || isSuccessfulHydratedResumeArtifact(resume)) &&
    (hasNonEmptyPayload(resume?.responseBody) || hasNonEmptyText(resume?.content) || hasHydratedResumeArtifact(normalizedArtifacts));
  const hasResumeArtifactPersisted =
    hasRenderableResumeArtifact;
  const hasCoverLetterArtifactPersisted =
    hasNonEmptyPayload(coverLetter?.responseBody) || hasNonEmptyText(coverLetter?.content);

  return { hasResumeArtifactPersisted, hasCoverLetterArtifactPersisted };
}
