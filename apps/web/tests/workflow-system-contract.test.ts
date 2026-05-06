import { describe, expect, it, vi } from "vitest";
import React from "react";

import type { GenerationReadiness } from "@/lib/generationReadiness";
import type { WorkflowAuthorityResult } from "@/lib/resolveWorkflowAuthority";
import { resolveWorkflowOrchestrator, type WorkflowOrchestratorInput } from "@/lib/workflowOrchestrator";
import { render } from "@testing-library/react";
import { useWorkflowGuardrails } from "@/lib/workflowGuardrails";
import type { AnalyticsEventMap, AnalyticsEventName } from "@/src/lib/analytics";

function readiness(status: GenerationReadiness["status"], blocked: boolean): GenerationReadiness {
  const badgeLabel: GenerationReadiness["badgeLabel"] =
    status === "blocked" ? "BLOCKED" : status === "limited" ? "LIMITED" : "READY";
  return {
    status,
    blocked,
    reasonCodes: [],
    reasons: [],
    badgeLabel,
    summary: "test",
    verificationIssues: [],
  };
}

function workflowAuthority(
  workflowState: WorkflowAuthorityResult["workflowState"],
  primaryAction: WorkflowAuthorityResult["primaryAction"],
): Pick<WorkflowAuthorityResult, "workflowState" | "primaryAction" | "suppressFailureMessaging"> {
  return { workflowState, primaryAction, suppressFailureMessaging: false };
}

function baseInput(overrides: Partial<WorkflowOrchestratorInput> = {}): WorkflowOrchestratorInput {
  const base: WorkflowOrchestratorInput = {
    surface: "studio",
    score: 80,
    generationReadiness: readiness("ready", false),
    workflowAuthority: workflowAuthority("READY", "GENERATE"),
    artifact: {
      hasResume: false,
      hasCoverLetter: false,
      pairStatus: "missing",
      generating: false,
      failure: null,
    },
    resume: { status: "missing", confidence: "HIGH", failure: null },
    coverLetter: { status: "missing", confidence: "HIGH", failure: null },
    artifactQuality: { confidence: "HIGH" },
    allowStaleArtifactPreview: false,
    searchParamsString: "",
    unlockDismissed: false,
    unlockReanalysisFailure: null,
    postUnlock: {
      active: false,
      dismissed: true,
      priorScore: null,
      priorReadiness: null,
      newReadiness: null,
      reanalysisFailed: false,
      generationAllowedNow: false,
      returnToEvidenceHref: "/fit-review",
    },
    generationReady: { dismissed: false, phase: "ready" },
    resumeFailure: null,
    coverFailure: null,
    activity: { isActive: false, activeOperations: [] },
  };

  return {
    ...base,
    ...overrides,
    artifact: { ...base.artifact, ...(overrides.artifact ?? {}) },
    resume: { ...base.resume, ...(overrides.resume ?? {}) },
    coverLetter: { ...base.coverLetter, ...(overrides.coverLetter ?? {}) },
    postUnlock: { ...base.postUnlock, ...(overrides.postUnlock ?? {}) },
    generationReady: { ...base.generationReady, ...(overrides.generationReady ?? {}) },
  };
}

describe("workflow orchestrator contract", () => {
  it("score >= 80 allows generation even when readiness is limited", () => {
    const orchestrator = resolveWorkflowOrchestrator(
      baseInput({
        score: 80,
        generationReadiness: readiness("limited", false),
        workflowAuthority: {
          workflowState: "READY",
          primaryAction: "GENERATE",
          canGenerate: true,
          suppressFailureMessaging: false,
        },
      }),
    );

    expect(orchestrator.contract.generation.state).toBe("ready");
    expect(orchestrator.contract.authority.canGenerate).toBe(true);
  });

  it("pair blocked readiness overrides generation-ready and in-progress authorities", () => {
    const blockedOrchestrator = resolveWorkflowOrchestrator(
      baseInput({
        generationReadiness: readiness("blocked", true),
        artifact: {
          hasResume: false,
          hasCoverLetter: false,
          pairStatus: "generating",
          generating: true,
          failure: null,
        },
        generationReady: { dismissed: false, phase: "ready" },
      }),
    );

    expect(blockedOrchestrator.authorityState.canonicalState).toBe("hard_blocked");
    expect(blockedOrchestrator.authorityState.trustTone).toBe("blocked");
  });

  it("does not downgrade generated artifacts to blocked when readiness later reports blocked", () => {
    const orchestrator = resolveWorkflowOrchestrator(
      baseInput({
        generationReadiness: readiness("blocked", true),
        artifact: {
          hasResume: true,
          hasCoverLetter: true,
          pairStatus: "completed",
          generating: false,
          failure: null,
        },
        resume: { status: "ready" },
        coverLetter: { status: "ready" },
      }),
    );

    expect(orchestrator.contract.generation.state).toBe("generated");
    expect(orchestrator.contract.generation.auto.shouldStart).toBe(false);
  });

  it("generation_in_progress always overrides generation_ready", () => {
    const orchestrator = resolveWorkflowOrchestrator(
      baseInput({
        generationReadiness: readiness("ready", false),
        artifact: {
          hasResume: false,
          hasCoverLetter: false,
          pairStatus: "missing",
          generating: true,
          failure: null,
        },
        resume: { status: "generating" },
        coverLetter: { status: "missing" },
        generationReady: { dismissed: false, phase: "ready" },
      }),
    );

    expect(orchestrator.authorityState.canonicalState).toBe("generation_in_progress");
    expect(orchestrator.authorityState.trustTone).toBe("in_progress");
  });

  it("visible local generation (artifact.generating) overrides generation_ready even when artifacts are still missing", () => {
    const orchestrator = resolveWorkflowOrchestrator(
      baseInput({
        generationReadiness: readiness("ready", false),
        artifact: {
          hasResume: false,
          hasCoverLetter: false,
          pairStatus: "missing",
          generating: true,
          failure: null,
        },
        resume: { status: "missing" },
        coverLetter: { status: "missing" },
        generationReady: { dismissed: false, phase: "ready" },
      }),
    );

    expect(orchestrator.authorityState.canonicalState).toBe("generation_in_progress");
    expect(orchestrator.authorityState.trustTone).toBe("in_progress");
  });

  it("enforces precedence: unlock flow suppresses post-unlock outcome", () => {
    const orchestrator = resolveWorkflowOrchestrator(
      baseInput({
        searchParamsString:
          "fromUnlock=true&unlockDimension=Tools%20%26%20Systems&missingEvidence=Zendesk&missingEvidence=Service%20Cloud",
        postUnlock: {
          active: true,
          dismissed: false,
          priorScore: 78,
          priorReadiness: "blocked",
          newReadiness: "limited",
          reanalysisFailed: false,
          generationAllowedNow: false,
          returnToEvidenceHref: "/fit-review",
        },
      }),
    );

    expect(orchestrator.unlockState.isUnlockFlowActive).toBe(true);
    expect(orchestrator.postUnlockState.active).toBe(false);
  });

  it("enforces precedence: post-unlock suppresses generation-ready priority", () => {
    const orchestrator = resolveWorkflowOrchestrator(
      baseInput({
        score: 86,
        generationReadiness: readiness("ready", false),
        artifact: { hasResume: false, hasCoverLetter: false, pairStatus: "missing", generating: false, failure: null },
        postUnlock: {
          active: true,
          dismissed: false,
          priorScore: 78,
          priorReadiness: "blocked",
          newReadiness: "ready",
          reanalysisFailed: false,
          generationAllowedNow: true,
          returnToEvidenceHref: "/fit-review",
        },
        generationReady: { dismissed: false, phase: "ready" },
      }),
    );

    expect(orchestrator.postUnlockState.active).toBe(true);
    expect(orchestrator.generationReadyState.isPriority).toBe(false);
    expect(orchestrator.authorityState.canonicalState).toBe("post_unlock_outcome");
  });

  it("keeps artifact truth aligned: in-progress authority suppresses stale previews", () => {
    const orchestrator = resolveWorkflowOrchestrator(
      baseInput({
        score: 88,
        generationReadiness: readiness("ready", false),
        artifact: {
          hasResume: true,
          hasCoverLetter: true,
          pairStatus: "in_progress",
          generating: true,
          failure: null,
        },
        resume: { status: "ready", confidence: "HIGH", failure: null },
        coverLetter: { status: "ready", confidence: "HIGH", failure: null },
        generationReady: { dismissed: false, phase: "generating" },
      }),
    );

    expect(orchestrator.authorityState.canonicalState).toBe("generation_in_progress");
    expect(orchestrator.artifactState.artifactDisplayState).toBe("stale_output_hidden");
    expect(orchestrator.artifactState.shouldSuppressStalePreview).toBe(true);
  });

  it("never marks generation-ready priority when a stronger authority is active", () => {
    const orchestrator = resolveWorkflowOrchestrator(
      baseInput({
        searchParamsString:
          "fromUnlock=true&unlockDimension=Industry%20Experience&missingEvidence=Healthcare%20SaaS",
        generationReadiness: readiness("ready", false),
        postUnlock: {
          active: true,
          dismissed: false,
          priorScore: 80,
          priorReadiness: "limited",
          newReadiness: "ready",
          reanalysisFailed: false,
          generationAllowedNow: true,
          returnToEvidenceHref: "/fit-review",
        },
        generationReady: { dismissed: false, phase: "ready" },
      }),
    );

    expect(orchestrator.unlockState.isUnlockFlowActive).toBe(true);
    expect(orchestrator.postUnlockState.active).toBe(false);
    expect(orchestrator.generationReadyState.isPriority).toBe(false);
  });

  it("emits structured diagnostics when generation readiness input is malformed", () => {
    const orchestrator = resolveWorkflowOrchestrator(
      baseInput({
        // Deliberately malformed at runtime to prove we don't silently fall through.
        generationReadiness: {} as unknown as GenerationReadiness,
      }),
    );

    const violations = orchestrator.diagnostics?.violations ?? [];
    expect(violations.some((v) => v.violationType === "unknown_workflow_fallthrough")).toBe(true);
    expect(["generation_ready", "documents_ready"].includes(orchestrator.authorityState.canonicalState)).toBe(false);
  });
});

describe("workflow guardrails contract (dev-only, deduped)", () => {
  function Probe(props: Parameters<typeof useWorkflowGuardrails>[0]) {
    useWorkflowGuardrails(props);
    return null;
  }

  it("dedupes identical violations across rerenders", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const trackEvent: (<TEvent extends AnalyticsEventName>(
      eventName: TEvent,
      properties: AnalyticsEventMap[TEvent],
    ) => void) = vi.fn();

    const orchestratorStub = {
      authorityState: {
        canonicalState: "generation_ready",
        trustTone: "ready",
        headline: "x",
        body: "y",
        primaryAction: { label: "z", destination: "studio_generate" },
      },
      artifactState: { shouldSuppressStalePreview: false } as unknown as any,
      unlockState: { isUnlockFlowActive: true } as any,
      postUnlockState: { active: false } as any,
      generationReadyState: { isPriority: true } as any,
    };

    const rendered = {
      workflowAuthorityPanel: false,
      unlockFlow: false,
      postUnlockOutcome: false,
      generationReadyShell: true,
      artifactTruthPanel: false,
      staleArtifactPreview: false,
      activityBanner: true,
    };

    const first = render(
      React.createElement(Probe, {
        surface: "studio",
        orchestrator: orchestratorStub as any,
        rendered,
        context: { failureActive: false, resumeState: "missing", coverState: "missing" },
        trackEvent,
      }),
    );
    first.rerender(
      React.createElement(Probe, {
        surface: "studio",
        orchestrator: orchestratorStub as any,
        rendered,
        context: { failureActive: false, resumeState: "missing", coverState: "missing" },
        trackEvent,
      }),
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect((warnSpy.mock.calls[0]?.[1] as any)?.violationType).toBe("generation_ready_conflicts_with_unlock");
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      "workflow_contract_violation_detected",
      expect.objectContaining({
        violation_type: "generation_ready_conflicts_with_unlock",
        surface: "studio",
        unlock_active: true,
        generation_ready_active: true,
      }),
    );

    warnSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it("emits again when the violation meaningfully changes", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const orchestratorStub = {
      authorityState: {
        canonicalState: "generation_in_progress",
        trustTone: "in_progress",
        headline: "x",
        body: "y",
        primaryAction: { label: "z", destination: "studio_workspace" },
      },
      artifactState: { shouldSuppressStalePreview: true } as any,
      unlockState: { isUnlockFlowActive: false } as any,
      postUnlockState: { active: false } as any,
      generationReadyState: { isPriority: false } as any,
    };

    const rendered = {
      workflowAuthorityPanel: true,
      unlockFlow: false,
      postUnlockOutcome: false,
      generationReadyShell: false,
      artifactTruthPanel: true,
      staleArtifactPreview: true,
      activityBanner: true,
    };

    const view = render(
      React.createElement(Probe, {
        surface: "results",
        orchestrator: orchestratorStub as any,
        rendered,
        context: { failureActive: false, resumeState: "ready", coverState: "ready" },
      }),
    );

    expect((warnSpy.mock.calls[0]?.[1] as any)?.violationType).toBe("stale_preview_rendered_while_suppressed");

    // Change to a different, meaningful conflict -> should emit again.
    view.rerender(
      React.createElement(Probe, {
        surface: "results",
        orchestrator: {
          ...orchestratorStub,
          unlockState: { isUnlockFlowActive: true },
          artifactState: { shouldSuppressStalePreview: false },
        } as any,
        rendered: { ...rendered, generationReadyShell: true, staleArtifactPreview: false, workflowAuthorityPanel: false },
        context: { failureActive: false, resumeState: "ready", coverState: "ready" },
      }),
    );

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect((warnSpy.mock.calls[1]?.[1] as any)?.violationType).toBe("generation_ready_conflicts_with_unlock");

    warnSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });
});
