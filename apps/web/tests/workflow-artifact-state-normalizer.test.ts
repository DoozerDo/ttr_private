import { describe, expect, it } from "vitest";

import { normalizeWorkflowArtifactState } from "@/lib/workflowArtifactStateNormalizer";

describe("workflow artifact state normalizer", () => {
  it("classifies resume-ready + cover-failed as partial failure (retryable) when not blocked", () => {
    const model = normalizeWorkflowArtifactState({
      resume: { status: "ready", confidence: "HIGH" },
      coverLetter: { status: "failed", confidence: "HIGH", failure: { category: "generation_failed", retryable: true } },
      artifactQuality: { confidence: "HIGH" },
      workflowCanonicalState: "partial_documents",
      workflowTrustTone: "recovery",
      workflowIsBlocked: false,
    });

    expect(model.artifactDisplayState).toBe("partial_failure_retryable");
    expect(model.primaryAction.action).toBe("retry_failed_artifact");
    expect(model.shouldSuppressStalePreview).toBe(false);
  });

  it("classifies resume-ready + cover-failed as partial failure (non-retryable) when blocked", () => {
    const model = normalizeWorkflowArtifactState({
      resume: { status: "ready", confidence: "HIGH" },
      coverLetter: { status: "failed", confidence: "HIGH", failure: { category: "generation_blocked", retryable: false } },
      artifactQuality: { confidence: "HIGH" },
      workflowCanonicalState: "hard_blocked",
      workflowTrustTone: "blocked",
      workflowIsBlocked: true,
    });

    expect(model.artifactDisplayState).toBe("partial_failure_non_retryable");
    expect(model.primaryAction.action).toBe("return_to_evidence");
  });

  it("classifies both-ready + high confidence as both_ready_high_confidence", () => {
    const model = normalizeWorkflowArtifactState({
      resume: { status: "ready", confidence: "HIGH" },
      coverLetter: { status: "ready", confidence: "HIGH" },
      artifactQuality: { confidence: "HIGH" },
      workflowCanonicalState: "documents_ready",
      workflowTrustTone: "complete",
      workflowIsBlocked: false,
    });

    expect(model.artifactDisplayState).toBe("both_ready_high_confidence");
    expect(model.primaryAction.action).toBe("open_documents");
    expect(model.shouldShowLowConfidenceWarning).toBe(false);
  });

  it("flags low confidence when any ready output is LOW", () => {
    const model = normalizeWorkflowArtifactState({
      resume: { status: "ready", confidence: "HIGH" },
      coverLetter: { status: "ready", confidence: "LOW" },
      artifactQuality: { confidence: "MEDIUM" },
      workflowCanonicalState: "documents_ready",
      workflowTrustTone: "ready",
      workflowIsBlocked: false,
    });

    expect(model.artifactDisplayState).toBe("both_ready_mixed_confidence");
    expect(model.shouldShowLowConfidenceWarning).toBe(true);
  });

  it("suppresses stale previews when workflow is generating and ready outputs exist", () => {
    const model = normalizeWorkflowArtifactState({
      resume: { status: "ready", confidence: "HIGH" },
      coverLetter: { status: "ready", confidence: "HIGH" },
      artifactQuality: { confidence: "HIGH" },
      workflowCanonicalState: "generation_in_progress",
      workflowTrustTone: "in_progress",
      workflowIsBlocked: false,
    });

    expect(model.artifactDisplayState).toBe("stale_output_hidden");
    expect(model.shouldSuppressStalePreview).toBe(true);
  });

  it("allows stale previews when explicitly permitted", () => {
    const model = normalizeWorkflowArtifactState({
      resume: { status: "ready", confidence: "HIGH" },
      coverLetter: { status: "ready", confidence: "HIGH" },
      artifactQuality: { confidence: "HIGH" },
      workflowCanonicalState: "generation_failed",
      workflowTrustTone: "failure",
      workflowIsBlocked: false,
      allowStalePreview: true,
    });

    expect(model.artifactDisplayState).toBe("both_ready_high_confidence");
    expect(model.shouldSuppressStalePreview).toBe(false);
  });
});

