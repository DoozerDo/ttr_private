import { describe, expect, it } from "vitest";
import { resolveDocumentReadinessState } from "@shared/documentReadinessState";
import { buildStudioArtifactContract } from "@/src/lib/studio/artifactContract";
import { getArtifactExistence } from "@/src/lib/studio/artifactAuthority";

function canonicalResumeResult() {
  return {
    artifactType: "resume",
    status: "success",
    generationStatus: "success",
    generationState: "generated_usable",
    qualityStatus: "pass",
    qualityGate: { status: "pass", reasons: [] },
    preview: {
      resume: {
        heading: { name: "Alex" },
        summary: "General ops leader focused on reliability.",
        experience: [{ company: "Acme", roleTitle: "Lead", bullets: ["Built systems."] }],
        education: [],
        competencies: [],
        coreCompetencies: [],
      },
    },
    correctionReasons: [],
    exportReady: true,
    exports: { docx: true, pdf: true },
    actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: false },
  } as const;
}

function canonicalCoverLetterResult() {
  return {
    artifactType: "cover_letter",
    status: "success",
    generationStatus: "success",
    generationState: "generated_usable",
    qualityStatus: "pass",
    qualityGate: { status: "pass", reasons: [] },
    preview: { coverLetter: { paragraphs: ["Hello", "I am interested."] } },
    correctionReasons: [],
    exportReady: true,
    exports: { docx: true, pdf: true },
    actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: false },
  } as const;
}

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
  it("accepts a valid canonical resumeResult as ready output", () => {
    const contract = buildStudioArtifactContract({
      resumeResponse: { resumeResult: canonicalResumeResult() },
      coverLetterResponse: { coverLetterResult: canonicalCoverLetterResult() },
      canExportDocuments: true,
      isPro: true,
    });

    expect(contract.results.resume?.generationState).toBe("generated_usable");
    expect(contract.results.resume?.qualityStatus).toBe("pass");
    expect(contract.displayContract.resumePreviewRenderable).toBe(true);
    expect(contract.resumeExportAvailable).toBe(true);
    expect(contract.presenters.resume.status).toBe("success");
  });

  it("accepts a valid canonical coverLetterResult as ready output", () => {
    const contract = buildStudioArtifactContract({
      resumeResponse: { resumeResult: canonicalResumeResult() },
      coverLetterResponse: { coverLetterResult: canonicalCoverLetterResult() },
      canExportDocuments: true,
      isPro: true,
    });

    expect(contract.results.coverLetter?.generationState).toBe("generated_usable");
    expect(contract.results.coverLetter?.qualityStatus).toBe("pass");
    expect(contract.displayContract.coverLetterPreviewRenderable).toBe(true);
    expect(contract.coverLetterExportAvailable).toBe(true);
    expect(contract.presenters.coverLetter.status).toBe("success");
  });

  it("does not create readiness from raw generationStatus/exportReady fields without a canonical result", () => {
    const contract = buildStudioArtifactContract({
      resumeResponse: {
        generationStatus: "success",
        exportReady: true,
        preview: { resume: { summary: "legacy raw data" } },
      },
      coverLetterResponse: {
        generationStatus: "success",
        exportReady: true,
        preview: { coverLetter: { paragraphs: ["legacy raw data"] } },
      },
      canExportDocuments: true,
      isPro: true,
    });

    expect(contract.results.resume).toBeNull();
    expect(contract.results.coverLetter).toBeNull();
    expect(contract.displayContract.resumePreviewRenderable).toBe(false);
    expect(contract.displayContract.coverLetterPreviewRenderable).toBe(false);
    expect(contract.resumeExportAvailable).toBe(false);
    expect(contract.coverLetterExportAvailable).toBe(false);
    expect(contract.presenters.resume.status).not.toBe("success");
    expect(contract.presenters.coverLetter.status).not.toBe("success");
  });

  it("does not create readiness from nested payload.payload legacy data", () => {
    const contract = buildStudioArtifactContract({
      resumeResponse: {
        payload: {
          payload: {
            resumeResult: canonicalResumeResult(),
          },
        },
      },
      coverLetterResponse: {
        payload: {
          payload: {
            coverLetterResult: canonicalCoverLetterResult(),
          },
        },
      },
      canExportDocuments: true,
      isPro: true,
    });

    expect(contract.results.resume).toBeNull();
    expect(contract.results.coverLetter).toBeNull();
    expect(contract.displayContract.resumePreviewRenderable).toBe(false);
    expect(contract.displayContract.coverLetterPreviewRenderable).toBe(false);
    expect(contract.resumeExportAvailable).toBe(false);
    expect(contract.coverLetterExportAvailable).toBe(false);
  });

  it("hydrates canonical Studio artifacts successfully", () => {
    const contract = buildStudioArtifactContract({
      resumeResponse: { resumeResult: canonicalResumeResult() },
      coverLetterResponse: { coverLetterResult: canonicalCoverLetterResult() },
      canExportDocuments: true,
      isPro: true,
    });

    expect(contract.hasResumeArtifact).toBe(true);
    expect(contract.hasCoverLetterArtifact).toBe(true);
    expect(contract.displayContract.resumePreviewRenderable).toBe(true);
    expect(contract.displayContract.coverLetterPreviewRenderable).toBe(true);
    expect(contract.displayContract.generationComplete).toBe(true);
    expect(contract.displayContract.shouldAutoGenerateStart).toBe(false);
  });

  it("prefers canonical resumeResult.preview and ignores persisted resume payload fields", () => {
    const contract = buildStudioArtifactContract({
      resumeResponse: {
        status: "success",
        exportReady: true,
        content: "BILLING CONTAMINATION TEXT",
        preview: { resume: { summary: "Billing operations leader..." } },
        resumeResult: {
          artifactType: "resume",
          status: "success",
          generationStatus: "success",
          generationState: "generated_usable",
          qualityStatus: "pass",
          preview: {
            resume: {
              heading: { name: "Alex" },
              summary: "General ops leader focused on reliability.",
              experience: [],
              sections: [],
            },
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
          status: "success",
          generationStatus: "success",
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
          status: "success",
          generationStatus: "success",
          generationState: "generated_unusable",
          qualityStatus: "failed",
          preview: {
            resume: {
              heading: { name: "Alex" },
              summary: "Fallback resume should not count as renderable.",
              experience: [{ company: "Example", roleTitle: "Role", bullets: ["x"] }],
            },
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

    expect(contract.displayContract.resumePreviewRenderable).toBe(false);
    expect(contract.hasResumeArtifact).toBe(false);
    expect(contract.displayContract.shouldAutoGenerateStart).toBe(true);
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
