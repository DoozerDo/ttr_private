import { describe, expect, it } from "vitest";

import { buildStudioPageTruth } from "@/lib/studioPageTruth";

describe("Studio page truth matrix", () => {
  it("blocked evidence is mutually exclusive with generating", () => {
    const truth = buildStudioPageTruth({
      generationSupportState: "blocked",
      readiness: { state: "BLOCKED", reasons: [], evidenceSummary: [], verificationIssues: [] },
      trustGate: { allowed: false, reason: "blocked", baselineStatusLabel: "incomplete", roleAlignmentLabel: "needs improvement" },
      hasCompletedGeneration: false,
      isGenerating: true,
      hasAnyArtifacts: false,
      resumeState: { error: null, artifactFailure: null },
      coverState: { error: null, artifactFailure: null },
    });

    expect(truth.state).toBe("blocked_evidence");
    expect(truth.isGenerating).toBe(false);
  });

  it("artifact failure forces failed state even if draftable/ready", () => {
    const truth = buildStudioPageTruth({
      generationSupportState: "strong",
      readiness: { state: "READY", reasons: [], evidenceSummary: [], verificationIssues: [] },
      trustGate: { allowed: true, reason: null, baselineStatusLabel: "verified", roleAlignmentLabel: "strong match" },
      hasCompletedGeneration: false,
      isGenerating: true,
      hasAnyArtifacts: false,
      resumeState: { error: null, artifactFailure: null },
      coverState: { error: null, artifactFailure: { explanation: "Cover generation failed" } },
    });

    expect(truth.state).toBe("failed");
    expect(truth.isGenerating).toBe(false);
  });

  it("generated_reviewable wins once any artifact exists", () => {
    const truth = buildStudioPageTruth({
      generationSupportState: "strong",
      readiness: { state: "READY", reasons: [], evidenceSummary: [], verificationIssues: [] },
      trustGate: { allowed: true, reason: null, baselineStatusLabel: "verified", roleAlignmentLabel: "strong match" },
      hasCompletedGeneration: true,
      isGenerating: false,
      hasAnyArtifacts: true,
      resumeState: { error: null, artifactFailure: null },
      coverState: { error: null, artifactFailure: null },
    });

    expect(truth.state).toBe("generated_reviewable");
    expect(truth.isGenerating).toBe(false);
  });

  it("draftable_limited preserves generating only when no failures", () => {
    const truth = buildStudioPageTruth({
      generationSupportState: "partial",
      readiness: { state: "LIMITED", reasons: ["needs evidence"], evidenceSummary: [], verificationIssues: [] },
      trustGate: { allowed: true, reason: null, baselineStatusLabel: "verified", roleAlignmentLabel: "competitive" },
      hasCompletedGeneration: false,
      isGenerating: true,
      hasAnyArtifacts: false,
      resumeState: { error: null, artifactFailure: null },
      coverState: { error: null, artifactFailure: null },
    });

    expect(truth.state).toBe("draftable_limited");
    expect(truth.isGenerating).toBe(true);
  });
});
