import { describe, expect, it } from "vitest";

import { buildStudioArtifactContract } from "@/src/lib/studio/artifactContract";

function buildInput(options: {
  resumePreview?: unknown;
  coverPreview?: unknown;
  resumeQualityGateStatus?: "pass" | "failed" | "needs_refinement" | "blocked";
  coverQualityGateStatus?: "pass" | "failed" | "needs_refinement" | "blocked";
}) {
  const resumePreview = options.resumePreview ?? null;
  const coverPreview = options.coverPreview ?? null;
  const resumeQualityGateStatus = options.resumeQualityGateStatus ?? "pass";
  const coverQualityGateStatus = options.coverQualityGateStatus ?? "pass";
  const resumeGenerationState = resumeQualityGateStatus === "pass" ? "generated_usable" : "generation_failed";
  const coverGenerationState = coverQualityGateStatus === "pass" ? "generated_usable" : "generation_failed";
  return {
    resumeResponse: {
      resumeResult: {
        artifactType: "resume",
        status: "success",
        generationStatus: "success",
        generationState: resumeGenerationState,
        qualityStatus: resumeQualityGateStatus === "pass" ? "pass" : "failed",
        qualityGate: { status: resumeQualityGateStatus, reasons: [] },
        preview: resumePreview ? { resume: resumePreview } : null,
        correctionReasons: [],
        exportReady: true,
        exports: { docx: true, pdf: true },
      },
    },
    coverLetterResponse: {
      coverLetterResult: {
        artifactType: "cover_letter",
        status: "success",
        generationStatus: "success",
        generationState: coverGenerationState,
        qualityStatus: coverQualityGateStatus === "pass" ? "pass" : "failed",
        qualityGate: { status: coverQualityGateStatus, reasons: [] },
        preview: coverPreview ? { coverLetter: coverPreview } : null,
        correctionReasons: [],
        exportReady: true,
        exports: { docx: true, pdf: true },
      },
    },
    critiqueResult: null,
    canExportDocuments: true,
    isPro: true,
    persistedPipelineVersion: null,
    jobTitle: "Role",
    companyName: "Co",
  } as const;
}

describe("StudioArtifactDisplayContract", () => {
  it("Scenario A: both previews renderable => complete, not failed, no auto-gen", () => {
    const contract = buildStudioArtifactContract(
      buildInput({
        resumePreview: { heading: { name: "Alex" }, experience: [{ company: "Co", roleTitle: "Role", bullets: ["Did work."] }] },
        coverPreview: { paragraphs: ["Hello"] },
      }) as any,
    );
    expect(contract.displayContract.resumePreviewRenderable).toBe(true);
    expect(contract.displayContract.coverLetterPreviewRenderable).toBe(true);
    expect(contract.displayContract.generationComplete).toBe(true);
    expect(contract.displayContract.shouldAutoGenerateStart).toBe(false);
  });

  it("Scenario B: cover preview renderable, resume missing => auto-gen should start", () => {
    const contract = buildStudioArtifactContract(
      buildInput({
        resumePreview: null,
        coverPreview: { paragraphs: ["Hello"] },
      }) as any,
    );
    expect(contract.displayContract.coverLetterPreviewRenderable).toBe(true);
    expect(contract.displayContract.resumePreviewRenderable).toBe(false);
    expect(contract.displayContract.shouldAutoGenerateStart).toBe(true);
  });

  it("Scenario C: resume preview renderable, cover missing => auto-gen should start", () => {
    const contract = buildStudioArtifactContract(
      buildInput({
        resumePreview: { heading: { name: "Alex" }, experience: [{ company: "Co", roleTitle: "Role", bullets: ["Did work."] }] },
        coverPreview: null,
      }) as any,
    );
    expect(contract.displayContract.resumePreviewRenderable).toBe(true);
    expect(contract.displayContract.coverLetterPreviewRenderable).toBe(false);
    expect(contract.displayContract.shouldAutoGenerateStart).toBe(true);
  });

  it('Scenario D: both previews missing + failed => generationFailed true', () => {
    const contract = buildStudioArtifactContract(
      buildInput({
        resumePreview: null,
        coverPreview: null,
        resumeQualityGateStatus: "failed",
        coverQualityGateStatus: "failed",
      }) as any,
    );
    expect(contract.displayContract.resumePreviewRenderable).toBe(false);
    expect(contract.displayContract.coverLetterPreviewRenderable).toBe(false);
    expect(contract.displayContract.generationFailed).toBe(true);
    expect(contract.displayContract.shouldAutoGenerateStart).toBe(true);
  });
});
