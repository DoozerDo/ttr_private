export type ArtifactFailureCategory =
  | 'unsupported_input'
  | 'validation_failure'
  | 'trace_failure'
  | 'generation_blocked'
  | 'generation_failed';

export type ArtifactFailurePayload = {
  code: string;
  category: ArtifactFailureCategory;
  message: string;
  detail?: string;
  retryable: boolean;
  userAction?: {
    title: string;
    description: string;
  };
  diagnostics?: {
    failureReasons?: string[];
    unsupportedEnvelope?: string;
    traceCoverage?: number;
    missingRequirements?: string[];

    // Prompt 14 diagnostics (safe metadata only; no raw text).
    artifactReadiness?: 'blocked' | 'ready' | 'unknown';
    authoritativeExtractionSucceeded?: boolean;
    authoritativeExperienceGroupCount?: number;
    fallbackGenerationPrevented?: boolean;
    legacyFallbackAttemptBlocked?: boolean;
    generationTerminationStage?: string;
    structuredBaselineExperienceCount?: number;
    structuredBaselineMissingEvidenceReasons?: string[];
  };
};

export function buildArtifactFailurePayload(
  input: ArtifactFailurePayload,
): ArtifactFailurePayload {
  return input;
}
