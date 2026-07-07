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

function isSuccessfulResumeArtifact(resume: StudioArtifactsRecordLike): boolean {
  const responseBody = toRecord(resume?.responseBody);
  if (!responseBody) return false;

  const status = String(responseBody.status ?? "").trim().toLowerCase();
  const generationStatus = String(responseBody.generationStatus ?? "").trim().toLowerCase();
  const generationState = String(responseBody.generationState ?? "").trim().toLowerCase();
  const exportReady = responseBody.exportReady === true;
  const preview = toRecord(responseBody.preview)?.resume;

  return (
    status === "success" &&
    generationStatus === "success" &&
    (generationState === "" || generationState === "generated_usable") &&
    exportReady &&
    Boolean(preview) &&
    (hasNonEmptyText((resume as any)?.content) || hasNonEmptyText(responseBody.content))
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
