import { describe, expect, it } from "vitest";
import { resolveDocumentReadinessState } from "@shared/documentReadinessState";
import { buildStudioArtifactContract } from "@/src/lib/studio/artifactContract";
import { getArtifactExistence } from "@/src/lib/studio/artifactAuthority";

describe("DocumentReadinessState (Studio canonical)", () => {
  const artifact = (overrides: any) => ({
    generationState: "generated_usable",
    exportReady: true,
    qualityGate: { status: "pass", reasons: [] },
    correctionReasons: [],
    qualityStatus: "pass",
    actions: { canExport: true },
    ...overrides,
  });

  it("critique strong + contract failed => generated_unusable", () => {
    const state = resolveDocumentReadinessState({
      resumeArtifact: artifact({ qualityGate: { status: "needs_refinement", reasons: ["real_document_contract_failed"] }, exportReady: false }),
      coverLetterArtifact: artifact({}),
      critiqueResult: { readiness: "strong" } as any,
      qualityGate: null,
      exportReady: null,
      generationState: null,
    });
    expect(state.state).toBe("generated_unusable");
  });

  it("export buttons mirror canonical state (no independent override)", () => {
    const resumeResponse = { resumeResult: artifact({ exportReady: false, qualityGate: { status: "needs_refinement", reasons: ["summary_too_thin"] } }) };
    const coverLetterResponse = { coverLetterResult: artifact({ exportReady: false, qualityGate: { status: "needs_refinement", reasons: [] } }) };
    const contract = buildStudioArtifactContract({
      resumeResponse,
      coverLetterResponse,
      critiqueResult: { readiness: "ready" },
      canExportDocuments: true,
      isPro: true,
    });

    expect(contract.canonicalReadinessState).toBe("needs_refinement");
    expect(contract.resumeExportAvailable).toBe(false);
    expect(contract.coverLetterExportAvailable).toBe(false);
  });
});

describe("Studio artifact contract resume source", () => {
  it("prefers canonical resumeResult.preview and ignores persisted resume payload fields", () => {
    const contract = buildStudioArtifactContract({
      resumeResponse: {
        status: "success",
        exportReady: true,
        content: "BILLING CONTAMINATION TEXT",
        preview: { resume: { summary: "Billing operations leader..." } },
        resumeResult: {
          artifactType: "resume",
          generationState: "generated_usable",
          qualityStatus: "pass",
          preview: {
            heading: { name: "Alex" },
            summary: "General ops leader focused on reliability.",
            experience: [],
            sections: [],
          },
          correctionReasons: [],
          exportReady: true,
          exports: { docx: true, pdf: true },
          actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: false },
        },
      },
      coverLetterResponse: null,
      canExportDocuments: true,
      isPro: true,
    });

    expect(contract.resumeModel?.summary).toBe("General ops leader focused on reliability.");
  });

  it("does not render persisted resume.responseBody/content when resumeResult.preview is null or blocked", () => {
    const contract = buildStudioArtifactContract({
      resumeResponse: {
        status: "success",
        exportReady: true,
        content: "BILLING CONTAMINATION TEXT",
        preview: { resume: { summary: "Billing operations leader..." } },
        resumeResult: {
          artifactType: "resume",
          generationState: "blocked",
          qualityStatus: "failed",
          preview: null,
          correctionReasons: [],
          exportReady: false,
          exports: { docx: false, pdf: false },
          actions: { canEdit: true, canRegenerate: true, canExport: false, canSaveToOpportunities: false },
        },
      },
      coverLetterResponse: null,
      canExportDocuments: true,
      isPro: true,
    });

    expect(contract.resumeModel).toBeNull();
  });

  it("treats minimal fallback resume payloads as non-renderable even when preview text exists", () => {
    const contract = buildStudioArtifactContract({
      resumeResponse: {
        status: "success",
        exportReady: false,
        content: "Minimal fallback content",
        preview: {
          resume: {
            heading: { name: "Alex" },
            summary: "Fallback resume should not count as renderable.",
            experience: [{ company: "Example", roleTitle: "Role", bullets: ["x"] }],
          },
        },
        internal: {
          minimalFallback: true,
          resumeGenerationMode: "top_level_fail_safe_minimal",
          resumeFailSafeMinimalUsed: true,
        },
        resumeResult: {
          artifactType: "resume",
          generationState: "generated_unusable",
          qualityStatus: "failed",
          preview: {
            heading: { name: "Alex" },
            summary: "Fallback resume should not count as renderable.",
            experience: [{ company: "Example", roleTitle: "Role", bullets: ["x"] }],
          },
          correctionReasons: [],
          exportReady: false,
          exports: { docx: false, pdf: false },
          actions: { canEdit: true, canRegenerate: true, canExport: false, canSaveToOpportunities: false },
          internal: {
            minimalFallback: true,
            resumeGenerationMode: "top_level_fail_safe_minimal",
            resumeFailSafeMinimalUsed: true,
          },
          auditId: "minimal:1776648116795",
        },
      },
      coverLetterResponse: null,
      canExportDocuments: true,
      isPro: true,
    });

    expect(contract.resumePreviewRenderable).toBe(false);
    expect(contract.hasResumeArtifact).toBe(false);
    expect(contract.shouldAutoGenerateStart).toBe(true);
  });

  it("does not treat minimal resume artifacts as persisted output readiness", () => {
    const minimalExistence = getArtifactExistence({
      resume: {
        status: "COMPLETED",
        artifactId: "resume-minimal-1",
        responseBody: {
          status: "success",
          generationStatus: "success",
          auditId: "minimal:1776648116795",
          internal: {
            minimalFallback: true,
            resumeGenerationMode: "top_level_fail_safe_minimal",
            resumeFailSafeMinimalUsed: true,
          },
          preview: { resume: { heading: { name: "Alex" }, experience: [] } },
        },
        content: "fallback content",
      },
      coverLetter: {
        status: "COMPLETED",
        artifactId: "cover-1",
        responseBody: {
          status: "success",
          generationStatus: "success",
          exportReady: true,
          preview: { coverLetter: { paragraphs: ["Hello"] } },
        },
        content: "Hello",
      },
    });

    const hydratedExistence = getArtifactExistence({
      resume: {
        status: "COMPLETED",
        artifactId: "resume-current-1",
        responseBody: {
          status: "success",
          generationStatus: "success",
          auditId: "audit-1",
          preview: { resume: { heading: { name: "Alex" }, experience: [{ company: "Acme", roleTitle: "Lead" }] } },
        },
        content: "current resume",
      },
      coverLetter: {
        status: "COMPLETED",
        artifactId: "cover-2",
        responseBody: {
          status: "success",
          generationStatus: "success",
          exportReady: true,
          preview: { coverLetter: { paragraphs: ["Hello"] } },
        },
        content: "Hello",
      },
    });

    expect(minimalExistence.hasResumeArtifactPersisted).toBe(false);
    expect(minimalExistence.hasCoverLetterArtifactPersisted).toBe(true);
    expect(hydratedExistence.hasResumeArtifactPersisted).toBe(true);
    expect(hydratedExistence.hasCoverLetterArtifactPersisted).toBe(true);
  });

  it("treats a hydrated success resume as persisted even when a stale minimal audit id remains", () => {
    const hydratedSuccessExistence = getArtifactExistence({
      resume: {
        status: "COMPLETED",
        artifactId: "resume-current-2",
        responseBody: {
          status: "success",
          generationStatus: "success",
          exportReady: true,
          auditId: "minimal:1782045224649",
          preview: { resume: { heading: { name: "Alex" }, experience: [{ company: "Acme", roleTitle: "Lead" }] } },
        },
        content: "current resume",
      },
      coverLetter: {
        status: "COMPLETED",
        artifactId: "cover-3",
        responseBody: {
          status: "success",
          generationStatus: "success",
          exportReady: true,
          preview: { coverLetter: { paragraphs: ["Hello"] } },
        },
        content: "Hello",
      },
    });

    expect(hydratedSuccessExistence.hasResumeArtifactPersisted).toBe(true);
    expect(hydratedSuccessExistence.hasCoverLetterArtifactPersisted).toBe(true);
  });

  it("does not treat a failed unusable resume as persisted", () => {
    const failedExistence = getArtifactExistence({
      resume: {
        status: "FAILED",
        artifactId: "resume-failed-1",
        responseBody: null,
        content: null,
      },
      coverLetter: {
        status: "COMPLETED",
        artifactId: "cover-4",
        responseBody: {
          status: "success",
          generationStatus: "success",
          exportReady: true,
          preview: { coverLetter: { paragraphs: ["Hello"] } },
        },
        content: "Hello",
      },
    });

    expect(failedExistence.hasResumeArtifactPersisted).toBe(false);
    expect(failedExistence.hasCoverLetterArtifactPersisted).toBe(true);
  });
});
