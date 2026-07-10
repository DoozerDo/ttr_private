type StudioArtifactsRecordLike = {
  status?: unknown;
  generationState?: unknown;
  generationStatus?: unknown;
  exportReady?: unknown;
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

function isMinimalResumeArtifact(resume: StudioArtifactsRecordLike, responseBody: Record<string, unknown>): boolean {
  const resumeRecord = toRecord(resume);
  const responseInternal = responseBody.internal && typeof responseBody.internal === "object"
    ? (responseBody.internal as Record<string, unknown>)
    : null;
  const resumeInternal = resumeRecord?.internal && typeof resumeRecord.internal === "object"
    ? (resumeRecord.internal as Record<string, unknown>)
    : null;
  const minimalIndicators = [
    responseInternal?.minimalFallback,
    responseInternal?.resumeFailSafeMinimalUsed,
    responseInternal?.resumeGenerationMode,
    resumeInternal?.minimalFallback,
    resumeInternal?.resumeFailSafeMinimalUsed,
    resumeInternal?.resumeGenerationMode,
  ];
  return (
    minimalIndicators.some((value) => value === true || String(value ?? "").toLowerCase() === "true") ||
    String(responseInternal?.resumeGenerationMode ?? resumeInternal?.resumeGenerationMode ?? "").trim() ===
      "top_level_fail_safe_minimal"
  );
}

function isSuccessfulResumeArtifact(resume: StudioArtifactsRecordLike): boolean {
  if (!resume || typeof resume !== "object") return false;
  const resumeRecord = resume as Record<string, unknown>;
  const responseBody = toRecord(resume?.responseBody);
  if (!responseBody) return false;

  if (String(resumeRecord.status ?? "").trim().toUpperCase() !== "COMPLETED") return false;

  const status = String(responseBody.status ?? "").trim().toLowerCase();
  const generationStatus = String(responseBody.generationStatus ?? "").trim().toLowerCase();
  const generationState = String(responseBody.generationState ?? "").trim().toLowerCase();

  if (isMinimalResumeArtifact(resume, responseBody)) return false;

  return (
    status === "success" &&
    generationStatus === "success" &&
    (generationState === "" || generationState === "generated_usable")
  );
}

export function getArtifactExistence(normalizedArtifacts: StudioArtifactsPayloadLike): PersistedArtifactExistence {
  const resume = normalizedArtifacts?.resume ?? null;
  const coverLetter = normalizedArtifacts?.coverLetter ?? null;

  const hasResumeArtifactPersisted = isSuccessfulResumeArtifact(resume);
  const hasCoverLetterArtifactPersisted =
    Boolean(coverLetter?.responseBody) || hasNonEmptyText(coverLetter?.content);

  return { hasResumeArtifactPersisted, hasCoverLetterArtifactPersisted };
}
