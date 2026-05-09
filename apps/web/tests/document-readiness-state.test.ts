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

