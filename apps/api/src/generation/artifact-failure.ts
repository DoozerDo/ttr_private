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
  };
};

export function buildArtifactFailurePayload(
  input: ArtifactFailurePayload,
): ArtifactFailurePayload {
  return input;
}
