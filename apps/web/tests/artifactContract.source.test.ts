import { describe, expect, it } from "vitest";
import { resolveDocumentReadinessState } from "@shared/documentReadinessState";
import { buildStudioArtifactContract } from "@/src/lib/studio/artifactContract";

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
});

