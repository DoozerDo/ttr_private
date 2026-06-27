import { describe, expect, it } from "vitest";

import type { GenerationReadiness } from "@/lib/generationReadiness";
import { resolveResultsStudioRedirect } from "@/lib/resolveResultsStudioRedirect";
import { resolveWorkflowAuthority } from "@/lib/resolveWorkflowAuthority";
import { resolveWorkflowSurfaceAuthority } from "@/lib/workflowSurfaceAuthority";
import {
  isWorkflowDirectStudioEligible,
  isWorkflowGenerationUnlocked,
  WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR,
  WORKFLOW_UNLOCK_SCORE_FLOOR,
} from "@shared/workflowThresholds";
import { isDocumentGenerationUnlocked, isMomentumGenerationAllowed, shouldGenerateDocuments } from "@/lib/documentGenerationGate";

function readiness(status: GenerationReadiness["status"], blocked: boolean): GenerationReadiness {
  return {
    status,
    blocked,
    badgeLabel: status === "ready" ? "READY" : status === "blocked" ? "BLOCKED" : "LIMITED",
    reasonCodes: [],
    reasons: [],
    verificationIssues: [],
    summary: "",
  };
}

describe("workflow threshold routing", () => {
  it("uses the same shared thresholds for unlock and direct-studio routing", () => {
    expect(WORKFLOW_UNLOCK_SCORE_FLOOR).toBe(70);
    expect(WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR).toBe(80);

    for (const score of [69, 70, 79, 80, 90]) {
      expect(shouldGenerateDocuments(score)).toBe(score >= WORKFLOW_UNLOCK_SCORE_FLOOR);
      expect(isDocumentGenerationUnlocked(score)).toBe(score >= WORKFLOW_UNLOCK_SCORE_FLOOR);
      expect(isWorkflowGenerationUnlocked(score)).toBe(score >= WORKFLOW_UNLOCK_SCORE_FLOOR);
      expect(isMomentumGenerationAllowed(score)).toBe(score >= WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR);
      expect(isWorkflowDirectStudioEligible(score)).toBe(score >= WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR);
    }
  });

  it("routes 69 to a locked state, 70 and 79 to Fit Review, and 80 and 90 directly to Studio", () => {
    const workflowAuthorityForScore = (score: number) =>
      resolveWorkflowAuthority({
        score,
        generationReadiness: readiness(score >= WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR ? "ready" : "limited", false),
        resumeState: { hasOutput: false, failed: false },
        coverState: { hasOutput: false, failed: false },
        isPro: false,
        hasGeneratedOnce: false,
        isHydrating: false,
      });

    const lockedScore = 69;
    const lockedSurface = resolveWorkflowSurfaceAuthority({
      score: lockedScore,
      generationReadiness: readiness("limited", false),
      workflowAuthority: workflowAuthorityForScore(lockedScore),
      artifact: { hasResume: false, hasCoverLetter: false, pairStatus: "missing" },
      unlockContext: { active: false, hasMissingEvidence: false },
      postUnlockOutcomeState: null,
    });

    expect(workflowAuthorityForScore(lockedScore).workflowState).toBe("REVIEW_REQUIRED");
    expect(workflowAuthorityForScore(lockedScore).canGenerate).toBe(false);
    expect(lockedSurface.canonicalState).toBe("unlock_required");
    expect(lockedSurface.primaryAction.destination).toBe("fit_review");

    const lockedRedirect = resolveResultsStudioRedirect({
      from: "results",
      pathname: "/results",
      baselineId: "base-1",
      jobId: "job-1",
      analysisId: "analysis-1",
      baselineVersionId: "base-version-1",
      score: lockedScore,
      hasAnyUsableOutput: false,
      generationReadinessBlocked: false,
    });
    expect(lockedRedirect.redirectTo).toBeNull();

    for (const score of [70, 79]) {
      expect(workflowAuthorityForScore(score).workflowState).toBe("REVIEW_REQUIRED");
      expect(workflowAuthorityForScore(score).canGenerate).toBe(false);

      const surface = resolveWorkflowSurfaceAuthority({
        score,
        generationReadiness: readiness("limited", false),
        workflowAuthority: workflowAuthorityForScore(score),
        artifact: { hasResume: false, hasCoverLetter: false, pairStatus: "missing" },
        unlockContext: { active: false, hasMissingEvidence: false },
        postUnlockOutcomeState: null,
      });

      expect(surface.canonicalState).toBe("unlock_required");
      expect(surface.primaryAction.destination).toBe("studio_unlock");

      const redirect = resolveResultsStudioRedirect({
        from: "results",
        pathname: "/results",
        baselineId: "base-1",
        jobId: "job-1",
        analysisId: "analysis-1",
        baselineVersionId: "base-version-1",
        score,
        hasAnyUsableOutput: false,
        generationReadinessBlocked: false,
      });
      expect(redirect.redirectTo).toBeNull();
    }

    for (const score of [80, 90]) {
      expect(workflowAuthorityForScore(score).workflowState).toBe("READY");
      expect(workflowAuthorityForScore(score).canGenerate).toBe(true);

      const surface = resolveWorkflowSurfaceAuthority({
        score,
        generationReadiness: readiness("ready", false),
        workflowAuthority: workflowAuthorityForScore(score),
        artifact: { hasResume: false, hasCoverLetter: false, pairStatus: "missing" },
        unlockContext: { active: false, hasMissingEvidence: false },
        postUnlockOutcomeState: null,
      });

      expect(surface.canonicalState).toBe("generation_ready");
      expect(surface.primaryAction.destination).toBe("studio_generate");

      const redirect = resolveResultsStudioRedirect({
        from: "results",
        pathname: "/results",
        baselineId: "base-1",
        jobId: "job-1",
        analysisId: "analysis-1",
        baselineVersionId: "base-version-1",
        score,
        hasAnyUsableOutput: false,
        generationReadinessBlocked: false,
      });
      expect(redirect.redirectTo).toContain("/studio");
      expect(redirect.reason).toBe("results_auto_route_score_gte_80");
    }
  });
});
