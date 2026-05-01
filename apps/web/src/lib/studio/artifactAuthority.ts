type StudioArtifactsRecordLike = {
  responseBody?: unknown;
  content?: string | null;
} | null;

type StudioArtifactsPayloadLike = {
  resume?: StudioArtifactsRecordLike;
  coverLetter?: StudioArtifactsRecordLike;
} | null;

export type PersistedArtifactExistence = {
  hasResumeArtifactPersisted: boolean;
  hasCoverLetterArtifactPersisted: boolean;
};

function hasNonEmptyText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function getArtifactExistence(normalizedArtifacts: StudioArtifactsPayloadLike): PersistedArtifactExistence {
  const resume = normalizedArtifacts?.resume ?? null;
  const coverLetter = normalizedArtifacts?.coverLetter ?? null;

  const hasResumeArtifactPersisted =
    Boolean(resume?.responseBody) || hasNonEmptyText(resume?.content);
  const hasCoverLetterArtifactPersisted =
    Boolean(coverLetter?.responseBody) || hasNonEmptyText(coverLetter?.content);

  return { hasResumeArtifactPersisted, hasCoverLetterArtifactPersisted };
}
