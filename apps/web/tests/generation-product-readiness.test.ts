import { buildGenerationProductReadiness } from "@/lib/generationProductReadiness";

describe("generation product readiness contract", () => {
  it("fails closed below 70", () => {
    const readiness = buildGenerationProductReadiness({
      score: 69,
      authorityState: "READY",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });

    expect(readiness.canOpenStudio).toBe(false);
    expect(readiness.generation_readiness.canGenerate).toBe(false);
    expect(readiness.generation_readiness.canExport).toBe(false);
    expect(readiness.tier).toBe("fit_review_only");
  });

  it("unlocks studio and generation at 70+ when readiness is ready", () => {
    const readiness = buildGenerationProductReadiness({
      score: 72,
      authorityState: "READY",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });

    expect(readiness.canOpenStudio).toBe(true);
    expect(readiness.generation_readiness.canGenerate).toBe(true);
    expect(readiness.generation_readiness.canExport).toBe(true);
    expect(readiness.tier).toBe("generation_export_allowed");
  });

  it("allows generation at 70+ when readiness is ready and export for pro", () => {
    const score76 = buildGenerationProductReadiness({
      score: 76,
      authorityState: "READY",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });
    const score76NonPro = buildGenerationProductReadiness({
      score: 76,
      authorityState: "READY",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: false,
    });

    expect(score76.generation_readiness.canGenerate).toBe(true);
    expect(score76.generation_readiness.canExport).toBe(true);
    expect(score76.tier).toBe("generation_export_allowed");

    expect(score76NonPro.generation_readiness.canGenerate).toBe(true);
    expect(score76NonPro.generation_readiness.canExport).toBe(false);
    expect(score76NonPro.tier).toBe("generation_allowed");
  });

  it("fails closed when canonical assessment is missing", () => {
    const readiness = buildGenerationProductReadiness({
      score: 94,
      authorityState: "READY",
      hasCanonicalAssessment: false,
      hasRequiredContext: true,
      isPro: true,
    });

    expect(readiness.canOpenStudio).toBe(false);
    expect(readiness.generation_readiness.canGenerate).toBe(false);
    expect(readiness.generation_readiness.reasonsBlocked).toContain(
      "missing_canonical_assessment",
    );
  });
});
