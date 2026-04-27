import { describe, expect, it } from "vitest";

import type { GenerationReadiness } from "@/lib/generationReadiness";
import type { WorkflowAuthorityResult } from "@/lib/resolveWorkflowAuthority";
import { resolveWorkflowSurfaceAuthority } from "@/lib/workflowSurfaceAuthority";

function readiness(status: GenerationReadiness["status"], blocked: boolean): GenerationReadiness {
  return {
    status,
    blocked,
    badgeLabel: status === "ready" ? "Ready" : status === "blocked" ? "Blocked" : "Limited",
    reasons: [],
    verificationIssues: [],
  };
}

function workflowAuthority(
  workflowState: WorkflowAuthorityResult["workflowState"],
  primaryAction: WorkflowAuthorityResult["primaryAction"],
): Pick<WorkflowAuthorityResult, "workflowState" | "primaryAction"> {
  return { workflowState, primaryAction };
}

describe("workflow surface authority resolver", () => {
  it("returns generation_ready with studio_generate primary intent when readiness is ready and workflow supports generation", () => {
    const model = resolveWorkflowSurfaceAuthority({
      score: 82,
      generationReadiness: readiness("ready", false),
      workflowAuthority: workflowAuthority("READY", "GENERATE"),
      artifact: { hasResume: false, hasCoverLetter: false, pairStatus: "missing" },
      unlockContext: { active: false, hasMissingEvidence: false },
      postUnlockOutcomeState: null,
      generationReady: null,
    });

    expect(model.canonicalState).toBe("generation_ready");
    expect(model.primaryAction.destination).toBe("studio_generate");
    expect(model.trustTone).toBe("ready");
  });

  it("returns generation_ready when readiness is limited but not blocked and workflow supports generation", () => {
    const model = resolveWorkflowSurfaceAuthority({
      score: 82,
      generationReadiness: readiness("limited", false),
      workflowAuthority: workflowAuthority("READY", "GENERATE"),
      artifact: { hasResume: false, hasCoverLetter: false, pairStatus: "missing" },
      unlockContext: { active: false, hasMissingEvidence: false },
      postUnlockOutcomeState: null,
      generationReady: null,
    });

    expect(model.canonicalState).toBe("generation_ready");
    expect(model.primaryAction.destination).toBe("studio_generate");
    expect(model.trustTone).toBe("ready");
  });

  it("returns unlock_required with studio_unlock primary intent in the 70-84 band when no outputs exist", () => {
    const model = resolveWorkflowSurfaceAuthority({
      score: 78,
      generationReadiness: readiness("limited", false),
      workflowAuthority: workflowAuthority("REVIEW_REQUIRED", "REVIEW"),
      artifact: { hasResume: false, hasCoverLetter: false, pairStatus: "missing" },
      unlockContext: { active: false, hasMissingEvidence: false },
      postUnlockOutcomeState: null,
      generationReady: null,
    });

    expect(model.canonicalState).toBe("unlock_required");
    expect(model.primaryAction.destination).toBe("studio_unlock");
    expect(model.trustTone).toBe("recovery");
  });

  it("returns documents_ready when both artifacts exist", () => {
    const model = resolveWorkflowSurfaceAuthority({
      score: 88,
      generationReadiness: readiness("ready", false),
      workflowAuthority: workflowAuthority("READY", "REVIEW"),
      artifact: { hasResume: true, hasCoverLetter: true, pairStatus: "completed" },
      unlockContext: { active: false, hasMissingEvidence: false },
      postUnlockOutcomeState: null,
      generationReady: null,
    });

    expect(model.canonicalState).toBe("documents_ready");
    expect(model.trustTone).toBe("complete");
    expect(model.primaryAction.destination).toBe("studio_workspace");
  });

  it("returns generation_failed with retry intent when pair status failed", () => {
    const model = resolveWorkflowSurfaceAuthority({
      score: 82,
      generationReadiness: readiness("ready", false),
      workflowAuthority: workflowAuthority("READY", "RETRY"),
      artifact: { hasResume: false, hasCoverLetter: false, pairStatus: "generation_failed" },
      unlockContext: { active: false, hasMissingEvidence: false },
      postUnlockOutcomeState: null,
      generationReady: null,
    });

    expect(model.canonicalState).toBe("generation_failed");
    expect(model.trustTone).toBe("failure");
    expect(model.primaryAction.destination).toBe("studio_generate");
  });
});
