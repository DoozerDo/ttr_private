import { buildGenerationProductReadiness } from "@/lib/generationProductReadiness";

describe("generation product readiness contract", () => {
  it("fails closed at or below 70", () => {
    const readiness = buildGenerationProductReadiness({
      score: 70,
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

  it("unlocks studio and generation over 70 when readiness is ready", () => {
    const readiness = buildGenerationProductReadiness({
      score: 71,
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

  it("allows generation over 70 when readiness is ready and export for pro", () => {
    const scoreUnlocked = buildGenerationProductReadiness({
      score: 71,
      authorityState: "READY",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: true,
    });
    const scoreUnlockedNonPro = buildGenerationProductReadiness({
      score: 71,
      authorityState: "READY",
      hasCanonicalAssessment: true,
      hasRequiredContext: true,
      isPro: false,
    });

    expect(scoreUnlocked.generation_readiness.canGenerate).toBe(true);
    expect(scoreUnlocked.generation_readiness.canExport).toBe(true);
    expect(scoreUnlocked.tier).toBe("generation_export_allowed");

    expect(scoreUnlockedNonPro.generation_readiness.canGenerate).toBe(true);
    expect(scoreUnlockedNonPro.generation_readiness.canExport).toBe(false);
    expect(scoreUnlockedNonPro.tier).toBe("generation_allowed");
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
