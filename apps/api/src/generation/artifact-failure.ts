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

    // ResumeV2 authority diagnostics (safe metadata only; no raw text).
    resumeV2UsableExperienceCount?: number;

    // Resume unsupported-input diagnostics (safe metadata only; no raw baseline text).
    resumeFailureDiagnostics?: {
      validationReason?: string | null;
      validationReasons?: string[];
      baselineEvidenceCount?: number | null;
      baselineExperienceSectionCount?: number | null;
      resumeV2ExperienceCount?: number | null;
      selectedEvidenceCount?: number | null;
      fallbackAttempted?: boolean;
      fallbackSucceeded?: boolean;
      fallbackFailureReason?: string | null;
      normalizedDocumentSectionCount?: number | null;
      normalizedDocumentBulletCount?: number | null;
      afterFallback?: {
        validationReason?: string | null;
        validationReasons?: string[];
        resumeV2ExperienceCount?: number | null;
        selectedEvidenceCount?: number | null;
        normalizedDocumentSectionCount?: number | null;
        normalizedDocumentBulletCount?: number | null;
      };
    };

    // Single contract flag: prove whether the Studio fallback path executed in this request.
    fallbackPathExecuted?: boolean;
  };
};

export function buildArtifactFailurePayload(
  input: ArtifactFailurePayload,
): ArtifactFailurePayload {
  return input;
}
