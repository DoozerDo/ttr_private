"use client";

import { useEffect, useRef } from "react";

import type { WorkflowOrchestratorOutput, WorkflowOrchestratorSurface } from "@/lib/workflowOrchestrator";
import type { AnalyticsEventMap, AnalyticsEventName } from "@/src/lib/analytics";
import {
  type WorkflowContractViolation,
  workflowContractViolationKey,
} from "@/lib/workflowContractViolation";

export type WorkflowRenderedAuthorities = {
  workflowAuthorityPanel: boolean;
  unlockFlow: boolean;
  postUnlockOutcome: boolean;
  generationReadyShell: boolean;
  artifactTruthPanel: boolean;
  staleArtifactPreview: boolean;
  activityBanner: boolean;
};

function detectWorkflowContractViolations(input: {
  surface: WorkflowOrchestratorSurface;
  orchestrator: Pick<
    WorkflowOrchestratorOutput,
    "authorityState" | "artifactState" | "unlockState" | "postUnlockState" | "generationReadyState"
  >;
  rendered: WorkflowRenderedAuthorities;
  context?: {
    failureActive?: boolean;
    resumeState?: string | null;
    coverState?: string | null;
    resumeReadinessState?: string | null;
    coverReadinessState?: string | null;
    blockedRecoveryActive?: boolean | null;
  };
}): WorkflowContractViolation[] {
  const authority = input.orchestrator.authorityState;
  const failuresActive = Boolean(input.context?.failureActive);
  const violations: WorkflowContractViolation[] = [];
  const blockedRecoveryActive = Boolean(input.context?.blockedRecoveryActive);

  const primaryAuthorities = [
    input.rendered.unlockFlow,
    input.rendered.postUnlockOutcome,
    input.rendered.generationReadyShell,
    input.rendered.workflowAuthorityPanel,
  ].filter(Boolean).length;

  if (primaryAuthorities > 1) {
    violations.push({
      violationType: "multiple_primary_authorities",
      surface: input.surface,
      canonicalState: authority.canonicalState,
      trustTone: authority.trustTone,
      authorityFlags: {
        unlockActive: input.orchestrator.unlockState.isUnlockFlowActive,
        postUnlockActive: input.orchestrator.postUnlockState.active,
        generationReadyActive: input.orchestrator.generationReadyState.isPriority,
        failureActive: failuresActive,
      },
      artifactFlags: {
        stalePreviewSuppressed: input.orchestrator.artifactState.shouldSuppressStalePreview,
        stalePreviewRendered: input.rendered.staleArtifactPreview,
        resumeState: input.context?.resumeState ?? null,
        coverState: input.context?.coverState ?? null,
      },
      context: {
        primary_authorities_count: primaryAuthorities,
      },
    });
  }

  if (input.rendered.generationReadyShell && input.orchestrator.unlockState.isUnlockFlowActive) {
    violations.push({
      violationType: "generation_ready_conflicts_with_unlock",
      surface: input.surface,
      canonicalState: authority.canonicalState,
      trustTone: authority.trustTone,
      authorityFlags: {
        unlockActive: true,
        postUnlockActive: input.orchestrator.postUnlockState.active,
        generationReadyActive: true,
        failureActive: failuresActive,
      },
      artifactFlags: {
        stalePreviewSuppressed: input.orchestrator.artifactState.shouldSuppressStalePreview,
        stalePreviewRendered: input.rendered.staleArtifactPreview,
        resumeState: input.context?.resumeState ?? null,
        coverState: input.context?.coverState ?? null,
      },
    });
  }

  if (input.rendered.generationReadyShell && input.orchestrator.postUnlockState.active) {
    violations.push({
      violationType: "generation_ready_conflicts_with_post_unlock",
      surface: input.surface,
      canonicalState: authority.canonicalState,
      trustTone: authority.trustTone,
      authorityFlags: {
        unlockActive: input.orchestrator.unlockState.isUnlockFlowActive,
        postUnlockActive: true,
        generationReadyActive: true,
        failureActive: failuresActive,
      },
      artifactFlags: {
        stalePreviewSuppressed: input.orchestrator.artifactState.shouldSuppressStalePreview,
        stalePreviewRendered: input.rendered.staleArtifactPreview,
        resumeState: input.context?.resumeState ?? null,
        coverState: input.context?.coverState ?? null,
      },
    });
  }

  if (input.rendered.staleArtifactPreview && input.orchestrator.artifactState.shouldSuppressStalePreview) {
    violations.push({
      violationType: "stale_preview_rendered_while_suppressed",
      surface: input.surface,
      canonicalState: authority.canonicalState,
      trustTone: authority.trustTone,
      authorityFlags: {
        unlockActive: input.orchestrator.unlockState.isUnlockFlowActive,
        postUnlockActive: input.orchestrator.postUnlockState.active,
        generationReadyActive: input.orchestrator.generationReadyState.isPriority,
        failureActive: failuresActive,
      },
      artifactFlags: {
        stalePreviewSuppressed: true,
        stalePreviewRendered: true,
        resumeState: input.context?.resumeState ?? null,
        coverState: input.context?.coverState ?? null,
      },
    });
  }

  if (blockedRecoveryActive) {
    const canonical = String(authority.canonicalState ?? "");
    const generationAuthorityRendered =
      input.rendered.workflowAuthorityPanel &&
      (canonical === "generation_ready" || canonical === "generation_in_progress");
    const generationShellRendered = input.rendered.generationReadyShell;

    if (generationAuthorityRendered || generationShellRendered) {
      violations.push({
        violationType: "pair_blocked_conflicts_with_generation",
        surface: input.surface,
        canonicalState: authority.canonicalState,
        trustTone: authority.trustTone,
        authorityFlags: {
          unlockActive: input.orchestrator.unlockState.isUnlockFlowActive,
          postUnlockActive: input.orchestrator.postUnlockState.active,
          generationReadyActive: Boolean(input.rendered.generationReadyShell),
          failureActive: failuresActive,
        },
        artifactFlags: {
          stalePreviewSuppressed: input.orchestrator.artifactState.shouldSuppressStalePreview,
          stalePreviewRendered: input.rendered.staleArtifactPreview,
          resumeState: input.context?.resumeState ?? null,
          coverState: input.context?.coverState ?? null,
        },
        context: {
          resume_readiness_state: input.context?.resumeReadinessState ?? null,
          cover_readiness_state: input.context?.coverReadinessState ?? null,
          blocked_recovery_active: true,
          generation_shell_rendered: generationShellRendered,
          generation_authority_rendered: generationAuthorityRendered,
        },
      });
    }
  }

  return violations;
}

export function useWorkflowGuardrails(input: {
  surface: WorkflowOrchestratorSurface;
  orchestrator: Pick<
    WorkflowOrchestratorOutput,
    "authorityState" | "artifactState" | "unlockState" | "postUnlockState" | "generationReadyState"
  >;
  rendered: WorkflowRenderedAuthorities;
  context?: {
    failureActive?: boolean;
    resumeState?: string | null;
    coverState?: string | null;
    resumeReadinessState?: string | null;
    coverReadinessState?: string | null;
    blockedRecoveryActive?: boolean | null;
  };
  orchestratorViolations?: WorkflowContractViolation[] | null;
  trackEvent?: (<TEvent extends AnalyticsEventName>(
    eventName: TEvent,
    properties: AnalyticsEventMap[TEvent],
  ) => void) | null;
}) {
  const emittedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return;

    const derivedViolations = detectWorkflowContractViolations({
      surface: input.surface,
      orchestrator: input.orchestrator,
      rendered: input.rendered,
      context: input.context,
    });

    const violations = [...(input.orchestratorViolations ?? []), ...derivedViolations];
    if (!violations.length) return;

    for (const violation of violations) {
      const key = workflowContractViolationKey(violation);
      if (emittedKeysRef.current.has(key)) continue;
      emittedKeysRef.current.add(key);

      // eslint-disable-next-line no-console
      console.warn("[workflow-guardrails] Contract violation", violation);

      if (input.trackEvent) {
        input.trackEvent("workflow_contract_violation_detected", {
          violation_type: violation.violationType,
          surface: violation.surface,
          canonical_state: violation.canonicalState ?? null,
          trust_tone: violation.trustTone ?? null,
          unlock_active: violation.authorityFlags.unlockActive,
          post_unlock_active: violation.authorityFlags.postUnlockActive,
          generation_ready_active: violation.authorityFlags.generationReadyActive,
          failure_active: violation.authorityFlags.failureActive,
          stale_preview_suppressed: violation.artifactFlags.stalePreviewSuppressed,
          stale_preview_rendered: violation.artifactFlags.stalePreviewRendered,
          resume_state: violation.artifactFlags.resumeState ?? null,
          cover_state: violation.artifactFlags.coverState ?? null,
        });
      }
    }
  }, [
    input.context,
    input.orchestrator,
    input.orchestratorViolations,
    input.rendered,
    input.surface,
    input.trackEvent,
  ]);
}
