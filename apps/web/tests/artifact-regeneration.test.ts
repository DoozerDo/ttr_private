import { describe, expect, it } from "vitest";

import { buildArtifactQualityModel, deriveArtifactConfidenceTransition } from "@/lib/artifactConfidence";

describe("artifact regeneration", () => {
  it("raises score and upgrades confidence after a claim is verified", () => {
    const baseInput = {
      artifactType: "resume" as const,
      score: 82,
      productConfidence: "MEDIUM" as const,
      verificationCoverage: {
        totalClaims: 3,
        verifiedClaims: 2,
        inferredClaims: 0,
        unverifiedClaims: 1,
        verifiedRequirements: ["Leadership scope", "Operational rigor"],
        unverifiedRequirements: ["Salesforce ownership"],
      },
      baselineEvidence: "Managed support operations.",
      summary: "Managed support operations.",
    };

    const before = buildArtifactQualityModel({
      ...baseInput,
      verifiedClaimTexts: [],
    });
    const after = buildArtifactQualityModel({
      ...baseInput,
      verifiedClaimTexts: ["Salesforce ownership"],
    });

    const transition = deriveArtifactConfidenceTransition({ previous: before, next: after });

    expect(before.confidence).toBe("MEDIUM");
    expect(after.confidence).toBe("HIGH");
    expect(after.artifactScore).toBeGreaterThan(before.artifactScore);
    expect(after.missingEvidenceCount).toBeLessThan(before.missingEvidenceCount);
    expect(transition).toMatchObject({
      confidenceUpgraded: true,
      initialConfidence: "MEDIUM",
      finalConfidence: "HIGH",
    });
    expect(transition?.artifactScoreDelta).toBeGreaterThan(0);
  });
});
