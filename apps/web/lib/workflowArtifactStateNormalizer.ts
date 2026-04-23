export type WorkflowArtifactStatus = "missing" | "generating" | "ready" | "failed";
export type WorkflowArtifactConfidence = "LOW" | "MEDIUM" | "HIGH" | null;

export type WorkflowArtifactFailure = {
  category?: string | null;
  retryable?: boolean | null;
} | null;

export type WorkflowArtifactStateNormalizerOutput = {
  artifactDisplayState:
    | "none"
    | "both_ready_high_confidence"
    | "both_ready_mixed_confidence"
    | "resume_only_ready"
    | "cover_only_ready"
    | "partial_failure_retryable"
    | "partial_failure_non_retryable"
    | "both_failed_retryable"
    | "both_failed_non_retryable"
    | "stale_output_hidden";
  primaryArtifactTruth: {
    headline: string;
    body: string;
  };
  primaryAction: {
    label: string;
    action: "open_documents" | "retry_failed_artifact" | "retry_both" | "return_to_evidence" | "open_workspace";
  };
  secondaryAction?: {
    label: string;
    action: "open_documents" | "open_workspace" | "return_to_evidence";
  };
  shouldSuppressStalePreview: boolean;
  shouldShowLowConfidenceWarning: boolean;
};

function normalizeStatus(value: unknown): WorkflowArtifactStatus {
  if (value === "missing" || value === "generating" || value === "ready" || value === "failed") return value;
  return "missing";
}

function normalizeConfidence(value: unknown): WorkflowArtifactConfidence {
  if (value === "LOW" || value === "MEDIUM" || value === "HIGH") return value;
  return null;
}

function isRetryableFailure(failure: WorkflowArtifactFailure, fallback: boolean): boolean {
  if (failure && typeof failure.retryable === "boolean") return failure.retryable;
  return fallback;
}

function confidenceToLabel(confidence: WorkflowArtifactConfidence): "low" | "medium" | "high" | null {
  if (confidence === "LOW") return "low";
  if (confidence === "MEDIUM") return "medium";
  if (confidence === "HIGH") return "high";
  return null;
}

export function normalizeWorkflowArtifactState(input: {
  resume: {
    status: WorkflowArtifactStatus;
    confidence?: WorkflowArtifactConfidence;
    failure?: WorkflowArtifactFailure;
  };
  coverLetter: {
    status: WorkflowArtifactStatus;
    confidence?: WorkflowArtifactConfidence;
    failure?: WorkflowArtifactFailure;
  };
  artifactQuality?: { confidence?: WorkflowArtifactConfidence } | null;
  workflowCanonicalState:
    | "hard_blocked"
    | "unlock_required"
    | "post_unlock_outcome"
    | "generation_ready"
    | "generation_in_progress"
    | "documents_ready"
    | "partial_documents"
    | "generation_failed";
  workflowTrustTone: "blocked" | "recovery" | "ready" | "in_progress" | "complete" | "failure";
  workflowIsBlocked: boolean;
  // When the workflow authority is actively "generating" or "failed", any existing "ready" outputs may be stale.
  // We suppress them by default unless the caller chooses to surface them explicitly.
  allowStalePreview?: boolean;
}): WorkflowArtifactStateNormalizerOutput {
  const resumeStatus = normalizeStatus(input.resume.status);
  const coverStatus = normalizeStatus(input.coverLetter.status);
  const resumeConfidence = normalizeConfidence(input.resume.confidence);
  const coverConfidence = normalizeConfidence(input.coverLetter.confidence);

  const hasAnyReady = resumeStatus === "ready" || coverStatus === "ready";
  const hasBothReady = resumeStatus === "ready" && coverStatus === "ready";
  const hasAnyFailed = resumeStatus === "failed" || coverStatus === "failed";
  const hasBothFailed = resumeStatus === "failed" && coverStatus === "failed";
  const hasPartial = hasAnyReady && !hasBothReady;

  const anyRetryable =
    isRetryableFailure(input.resume.failure ?? null, resumeStatus === "failed") ||
    isRetryableFailure(input.coverLetter.failure ?? null, coverStatus === "failed");

  const blocked = Boolean(input.workflowIsBlocked);
  const retryEligible = !blocked && anyRetryable;

  const overallConfidence = normalizeConfidence(input.artifactQuality?.confidence);
  const showLowConfidenceWarning =
    (overallConfidence === "LOW" || resumeConfidence === "LOW" || coverConfidence === "LOW") &&
    (hasAnyReady || input.workflowCanonicalState === "documents_ready" || input.workflowCanonicalState === "partial_documents");

  const staleAuthorityActive =
    (input.workflowCanonicalState === "generation_in_progress" || input.workflowCanonicalState === "generation_failed") &&
    hasAnyReady;
  const suppressStalePreview = staleAuthorityActive && !Boolean(input.allowStalePreview);

  if (suppressStalePreview) {
    const headline =
      input.workflowCanonicalState === "generation_failed"
        ? "A newer generation attempt failed."
        : "Newer generation is in progress.";
    const body =
      input.workflowCanonicalState === "generation_failed"
        ? "Previous drafts are available, but they may not reflect the latest inputs. Open Studio to retry generation."
        : "Previous drafts are available, but they may not reflect the latest inputs.";
    return {
      artifactDisplayState: "stale_output_hidden",
      primaryArtifactTruth: {
        headline,
        body,
      },
      primaryAction: { label: "Open workspace", action: "open_workspace" },
      secondaryAction: { label: "Open previous drafts", action: "open_documents" },
      shouldSuppressStalePreview: true,
      shouldShowLowConfidenceWarning: showLowConfidenceWarning,
    };
  }

  if (!hasAnyReady && !hasAnyFailed) {
    return {
      artifactDisplayState: "none",
      primaryArtifactTruth: {
        headline: "No documents generated yet.",
        body: "Generate your resume and cover letter in Studio when you're ready.",
      },
      primaryAction: { label: "Open workspace", action: "open_workspace" },
      shouldSuppressStalePreview: false,
      shouldShowLowConfidenceWarning: false,
    };
  }

  if (hasBothFailed) {
    const state = retryEligible ? "both_failed_retryable" : "both_failed_non_retryable";
    return {
      artifactDisplayState: state,
      primaryArtifactTruth: {
        headline: "Document generation failed.",
        body: retryEligible ? "Try generating again." : "Generation is blocked. Return to evidence and clear the blocker.",
      },
      primaryAction: retryEligible
        ? { label: "Try generating again", action: "retry_both" }
        : { label: "Fix evidence gaps", action: "return_to_evidence" },
      secondaryAction: { label: "Open workspace", action: "open_workspace" },
      shouldSuppressStalePreview: false,
      shouldShowLowConfidenceWarning: showLowConfidenceWarning,
    };
  }

  if (hasPartial && hasAnyFailed) {
    const state = retryEligible ? "partial_failure_retryable" : "partial_failure_non_retryable";
    const headline =
      resumeStatus === "ready"
        ? "Your resume is ready. Your cover letter still needs attention."
        : "Your cover letter is ready. Your resume still needs attention.";
    return {
      artifactDisplayState: state,
      primaryArtifactTruth: {
        headline,
        body: retryEligible ? "One document failed to generate." : "Generation is blocked. Return to evidence to unblock generation.",
      },
      primaryAction: retryEligible
        ? { label: "Retry failed document", action: "retry_failed_artifact" }
        : { label: "Fix evidence gaps", action: "return_to_evidence" },
      secondaryAction: { label: "Open workspace", action: "open_workspace" },
      shouldSuppressStalePreview: false,
      shouldShowLowConfidenceWarning: showLowConfidenceWarning,
    };
  }

  if (hasBothReady) {
    const resumeLabel = confidenceToLabel(resumeConfidence) ?? confidenceToLabel(overallConfidence);
    const coverLabel = confidenceToLabel(coverConfidence) ?? confidenceToLabel(overallConfidence);
    const high = resumeLabel === "high" && coverLabel === "high";
    return {
      artifactDisplayState: high ? "both_ready_high_confidence" : "both_ready_mixed_confidence",
      primaryArtifactTruth: {
        headline: high ? "Your documents are ready." : "Your documents are ready, but one needs review.",
        body: "Open Studio to review, refine, and export.",
      },
      primaryAction: { label: "Open documents", action: "open_documents" },
      shouldSuppressStalePreview: false,
      shouldShowLowConfidenceWarning: showLowConfidenceWarning,
    };
  }

  if (resumeStatus === "ready") {
    return {
      artifactDisplayState: "resume_only_ready",
      primaryArtifactTruth: {
        headline: "Your resume is ready. Your cover letter still needs attention.",
        body: "Open Studio to generate or retry your cover letter.",
      },
      primaryAction: { label: "Open workspace", action: "open_workspace" },
      secondaryAction: { label: "Open resume draft", action: "open_documents" },
      shouldSuppressStalePreview: false,
      shouldShowLowConfidenceWarning: showLowConfidenceWarning,
    };
  }

  return {
    artifactDisplayState: "cover_only_ready",
    primaryArtifactTruth: {
      headline: "Your cover letter is ready. Your resume still needs attention.",
      body: "Open Studio to generate or retry your resume.",
    },
    primaryAction: { label: "Open workspace", action: "open_workspace" },
    secondaryAction: { label: "Open cover letter draft", action: "open_documents" },
    shouldSuppressStalePreview: false,
    shouldShowLowConfidenceWarning: showLowConfidenceWarning,
  };
}
