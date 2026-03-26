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

  it("unlocks studio at 70+ but keeps generation blocked below 85", () => {
    const readiness = buildGenerationProductReadiness({
      score: 72,
      authorityState: "READY",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });

    expect(readiness.canOpenStudio).toBe(true);
    expect(readiness.generation_readiness.canGenerate).toBe(false);
    expect(readiness.generation_readiness.canExport).toBe(false);
    expect(readiness.tier).toBe("studio_unlocked");
  });

  it("allows generation at 85+ and export at 92+ for pro", () => {
    const score85 = buildGenerationProductReadiness({
      score: 85,
      authorityState: "READY",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });
    const score92 = buildGenerationProductReadiness({
      score: 92,
      authorityState: "READY",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });

    expect(score85.generation_readiness.canGenerate).toBe(true);
    expect(score85.generation_readiness.canExport).toBe(false);
    expect(score85.tier).toBe("generation_allowed");

    expect(score92.generation_readiness.canGenerate).toBe(true);
    expect(score92.generation_readiness.canExport).toBe(true);
    expect(score92.tier).toBe("generation_export_allowed");
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
