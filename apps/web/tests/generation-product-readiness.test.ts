import { buildGenerationProductReadiness } from "@/lib/generationProductReadiness";

describe("generation product readiness contract", () => {
  it("fails closed below 80", () => {
    const readiness = buildGenerationProductReadiness({
      score: 79,
      authorityState: "READY",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });

    expect(readiness.canOpenStudio).toBe(false);
    expect(readiness.generation_readiness.canGenerate).toBe(false);
    expect(readiness.generation_readiness.canExport).toBe(false);
    expect(readiness.state).toBe("BLOCKED");
    expect(readiness.confidence).toBe("LOW");
    expect(readiness.needsVerification).toBe(true);
    expect(readiness.tier).toBe("fit_review_only");
  });

  it("unlocks studio and generation at 80+ when readiness is ready", () => {
    const readiness = buildGenerationProductReadiness({
      score: 80,
      authorityState: "READY",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });

    expect(readiness.canOpenStudio).toBe(true);
    expect(readiness.generation_readiness.canGenerate).toBe(true);
    expect(readiness.generation_readiness.canExport).toBe(true);
    expect(readiness.state).toBe("ALLOWED");
    expect(readiness.confidence).toBe("HIGH");
    expect(readiness.needsVerification).toBe(false);
    expect(readiness.tier).toBe("generation_export_allowed");
  });

  it("allows strong-fit generation even when verification is weak", () => {
    const readiness = buildGenerationProductReadiness({
      score: 84,
      authorityState: "BLOCKED",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
      hasCompletedGeneration: false,
    });

    expect(readiness.canOpenStudio).toBe(true);
    expect(readiness.generation_readiness.canGenerate).toBe(true);
    expect(readiness.state).toBe("ALLOWED");
    expect(readiness.confidence).toBe("MEDIUM");
    expect(readiness.needsVerification).toBe(true);
    expect(readiness.generationMode).toBe("draft");
  });

  it("allows generation at 80+ when readiness is ready and export for pro", () => {
    const score80 = buildGenerationProductReadiness({
      score: 80,
      authorityState: "READY",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });
    const score80NonPro = buildGenerationProductReadiness({
      score: 80,
      authorityState: "READY",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: false,
    });

    expect(score80.generation_readiness.canGenerate).toBe(true);
    expect(score80.generation_readiness.canExport).toBe(true);
    expect(score80.tier).toBe("generation_export_allowed");

    expect(score80NonPro.generation_readiness.canGenerate).toBe(true);
    expect(score80NonPro.generation_readiness.canExport).toBe(false);
    expect(score80NonPro.tier).toBe("generation_allowed");
  });

  it("blocks generation when required context is missing", () => {
    const readiness = buildGenerationProductReadiness({
      score: 94,
      authorityState: "READY",
      hasCanonicalAssessment: false,
      hasRequiredContext: true,
      isPro: true,
    });

    expect(readiness.canOpenStudio).toBe(false);
    expect(readiness.generation_readiness.canGenerate).toBe(false);
    expect(readiness.state).toBe("BLOCKED");
    expect(readiness.confidence).toBe("LOW");
    expect(readiness.generation_readiness.reasonsBlocked).toContain("missing_canonical_assessment");
  });

  it("keeps strong fit verified at 90+", () => {
    const readiness = buildGenerationProductReadiness({
      score: 94,
      authorityState: "BLOCKED",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });

    expect(readiness.canOpenStudio).toBe(true);
    expect(readiness.generation_readiness.canGenerate).toBe(true);
    expect(readiness.state).toBe("ALLOWED");
    expect(readiness.confidence).toBe("HIGH");
    expect(readiness.generationMode).toBe("verified");
  });
});
