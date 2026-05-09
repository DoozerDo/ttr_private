import { describe, expect, it } from "vitest";
import { isReusableGeneratedArtifact } from "@shared/isReusableGeneratedArtifact";
import { STUDIO_GENERATION_PIPELINE_VERSION } from "@shared/studioGenerationPipelineVersion";

describe("isReusableGeneratedArtifact", () => {
  it("returns true only for generated_usable + exportReady + pass + no real_document_contract_failed", () => {
    const decision = isReusableGeneratedArtifact(
      {
        artifactType: "resume",
        generationState: "generated_usable",
        qualityStatus: "pass",
        preview: { heading: { name: "Test" } },
        correctionReasons: [],
        exportReady: true,
        exports: { docx: true, pdf: true },
        actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: true },
      },
      { persistedPipelineVersion: STUDIO_GENERATION_PIPELINE_VERSION, currentPipelineVersion: STUDIO_GENERATION_PIPELINE_VERSION },
    );
    expect(decision.reusable).toBe(true);
    expect(decision.reasons).toEqual([]);
  });

  it("never reuses generated_unusable", () => {
    const decision = isReusableGeneratedArtifact(
      {
        artifactType: "resume",
        generationState: "generated_unusable",
        qualityStatus: "needs_refinement",
        preview: null,
        correctionReasons: [{ code: "needs_refinement", message: "needs_refinement", severity: "warning" }],
        exportReady: false,
        exports: { docx: false, pdf: false },
        actions: { canEdit: true, canRegenerate: true, canExport: false, canSaveToOpportunities: false },
      },
      { persistedPipelineVersion: STUDIO_GENERATION_PIPELINE_VERSION, currentPipelineVersion: STUDIO_GENERATION_PIPELINE_VERSION },
    );
    expect(decision.reusable).toBe(false);
  });

  it("never reuses generation_failed", () => {
    const decision = isReusableGeneratedArtifact(
      {
        artifactType: "resume",
        generationState: "generation_failed",
        qualityStatus: "failed",
        preview: null,
        correctionReasons: [{ code: "failed", message: "failed", severity: "error" }],
        exportReady: false,
        exports: { docx: false, pdf: false },
        actions: { canEdit: false, canRegenerate: true, canExport: false, canSaveToOpportunities: false },
      },
      { persistedPipelineVersion: STUDIO_GENERATION_PIPELINE_VERSION, currentPipelineVersion: STUDIO_GENERATION_PIPELINE_VERSION },
    );
    expect(decision.reusable).toBe(false);
  });

  it("blocks reuse when real_document_contract_failed exists", () => {
    const decision = isReusableGeneratedArtifact(
      {
        artifactType: "resume",
        generationState: "generated_usable",
        qualityStatus: "pass",
        preview: { heading: { name: "Test" } },
        correctionReasons: [
          { code: "real_document_contract_failed:baseline_evidence_too_weak", message: "x", severity: "warning" },
        ],
        exportReady: true,
        exports: { docx: true, pdf: true },
        actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: true },
      },
      { persistedPipelineVersion: STUDIO_GENERATION_PIPELINE_VERSION, currentPipelineVersion: STUDIO_GENERATION_PIPELINE_VERSION },
    );
    expect(decision.reusable).toBe(false);
    expect(decision.reasons).toContain("real_document_contract_failed");
  });

  it("forces regeneration eligibility on pipeline version mismatch", () => {
    const decision = isReusableGeneratedArtifact(
      {
        artifactType: "resume",
        generationState: "generated_usable",
        qualityStatus: "pass",
        preview: { heading: { name: "Test" } },
        correctionReasons: [],
        exportReady: true,
        exports: { docx: true, pdf: true },
        actions: { canEdit: true, canRegenerate: true, canExport: true, canSaveToOpportunities: true },
      },
      { persistedPipelineVersion: "studio-artifacts-v0", currentPipelineVersion: STUDIO_GENERATION_PIPELINE_VERSION },
    );
    expect(decision.reusable).toBe(false);
    expect(decision.pipelineVersionMismatch).toBe(true);
    expect(decision.reasons).toContain("pipeline_version_mismatch");
  });
});

