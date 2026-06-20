type StudioArtifactsRecordLike = {
  responseBody?: unknown;
  content?: string | null;
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

function hasNonEmptyText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptyPayload(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value !== "object") return true;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value as Record<string, unknown>).length > 0;
}

function hasHydratedResumeArtifact(normalizedArtifacts: StudioArtifactsPayloadLike): boolean {
  const resumeArtifactId = normalizedArtifacts?.resumeArtifactHydration?.resumeArtifactId;
  return typeof resumeArtifactId === "string" && resumeArtifactId.trim().length > 0;
}

export function getArtifactExistence(normalizedArtifacts: StudioArtifactsPayloadLike): PersistedArtifactExistence {
  const resume = normalizedArtifacts?.resume ?? null;
  const coverLetter = normalizedArtifacts?.coverLetter ?? null;

  const hasResumeArtifactPersisted =
    hasNonEmptyPayload(resume?.responseBody) ||
    hasNonEmptyText(resume?.content) ||
    hasHydratedResumeArtifact(normalizedArtifacts);
  const hasCoverLetterArtifactPersisted =
    hasNonEmptyPayload(coverLetter?.responseBody) || hasNonEmptyText(coverLetter?.content);

  return { hasResumeArtifactPersisted, hasCoverLetterArtifactPersisted };
}
