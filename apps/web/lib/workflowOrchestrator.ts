import type { GenerationReadiness } from "@/lib/generationReadiness";
import type { WorkflowAuthorityResult } from "@/lib/resolveWorkflowAuthority";
import type { StudioArtifactFailurePresentation } from "@/src/lib/studio/helpers";

import { resolveWorkflowSurfaceAuthority } from "@/lib/workflowSurfaceAuthority";
import type { WorkflowSurfaceAuthorityModel } from "@/lib/workflowSurfaceAuthorityModel";
import {
  normalizeWorkflowArtifactState,
  type WorkflowArtifactConfidence,
  type WorkflowArtifactFailure,
  type WorkflowArtifactStateNormalizerOutput,
  type WorkflowArtifactStatus,
} from "@/lib/workflowArtifactStateNormalizer";
import { resolveStudioUnlockContext, type StudioUnlockContext } from "@/lib/studioUnlockResolver";
import {
  resolvePostUnlockOutcome,
} from "@/lib/postUnlockOutcomeResolver";
import type { PostUnlockOutcomeModel, PostUnlockReadiness } from "@/lib/postUnlockOutcomeModel";
import { resolveStudioGenerationReadyModel, type StudioGenerationReadyModel } from "@/lib/studioGenerationReadyResolver";
import type { WorkflowActivitySnapshot } from "@/lib/workflowActivityTracker";
import type { WorkflowContractViolation } from "@/lib/workflowContractViolation";
import { resolveWorkflowAuthorityContract, type WorkflowAuthorityContract } from "@/lib/workflowAuthorityContract";

export type WorkflowOrchestratorSurface = "results" | "studio";

export type WorkflowOrchestratorInput = {
  surface: WorkflowOrchestratorSurface;

  ids?: {
    baselineId?: string | null;
    baselineVersionId?: string | null;
    jobId?: string | null;
    analysisId?: string | null;
    assessmentId?: string | null;
  } | null;

  score: number | null;
  generationReadiness: GenerationReadiness;
  workflowAuthority: Pick<WorkflowAuthorityResult, "workflowState" | "primaryAction" | "canGenerate" | "suppressFailureMessaging">;

  artifact: {
    hasResume: boolean;
    hasCoverLetter: boolean;
    pairStatus?: string | null;
    generating?: boolean;
    failure?: { category?: string | null; retryable?: boolean | null } | null;
  };

  resume: {
    status: WorkflowArtifactStatus;
    confidence?: WorkflowArtifactConfidence;
    failure?: WorkflowArtifactFailure;
  };
  coverLetter: {
    status: WorkflowArtifactStatus;
    confidence?: WorkflowArtifactConfidence;
    failure?: WorkflowArtifactFailure;
  };
  artifactQuality?: { confidence?: WorkflowArtifactConfidence } | null;
  allowStaleArtifactPreview?: boolean;

  // URL/search-param contexts.
  searchParamsString?: string;

  unlockDismissed?: boolean;
  unlockReanalysisFailure?: { priorScore: number | null; priorReadiness: PostUnlockReadiness | null; returnToEvidenceHref: string } | null;

  postUnlock: {
    active: boolean;
    dismissed: boolean;
    priorScore: number | null;
    priorReadiness: PostUnlockReadiness | null;
    newReadiness: PostUnlockReadiness | null;
    reanalysisFailed: boolean;
    generationAllowedNow: boolean;
    returnToEvidenceHref: string;
  };

  generationReady: {
    dismissed: boolean;
    phase: "ready" | "generating" | "failed";
  };

  // Studio-only failure surfaces (used by generation-ready resolver).
  resumeFailure: StudioArtifactFailurePresentation | null;
  coverFailure: StudioArtifactFailurePresentation | null;

  activity: WorkflowActivitySnapshot;
};

export type WorkflowOrchestratorOutput = {
  authorityState: WorkflowSurfaceAuthorityModel;
  contract: WorkflowAuthorityContract;
  artifactState: WorkflowArtifactStateNormalizerOutput;
  activityState: WorkflowActivitySnapshot;
  diagnostics?: {
    violations: WorkflowContractViolation[];
  };
  unlockState: {
    context: StudioUnlockContext;
    isUnlockFlowActive: boolean;
  };
  postUnlockState: {
    active: boolean;
    model: PostUnlockOutcomeModel | null;
  };
  unlockReanalysisFailureState: {
    model: PostUnlockOutcomeModel | null;
  };
  generationReadyState: {
    model: StudioGenerationReadyModel;
    isPriority: boolean;
  };
};

export function resolveWorkflowUnlockContext(input: { toString: () => string }): StudioUnlockContext {
  return resolveStudioUnlockContext(input);
}

function normalizeReadiness(readiness: GenerationReadiness): PostUnlockReadiness | null {
  const status = String(readiness.status ?? "").toLowerCase();
  if (status === "ready") return "ready";
  if (status === "limited") return "limited";
  if (status === "blocked") return "blocked";
  return null;
}

function safeSearchParamsString(value: unknown): string {
  if (typeof value === "string") return value;
  return "";
}

function isGenerationReadiness(value: unknown): value is GenerationReadiness {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<GenerationReadiness>;
  if (input.status !== "ready" && input.status !== "limited" && input.status !== "blocked") return false;
  if (typeof input.blocked !== "boolean") return false;
  if (input.badgeLabel !== "READY" && input.badgeLabel !== "LIMITED" && input.badgeLabel !== "BLOCKED") return false;
  if (!Array.isArray(input.reasonCodes)) return false;
  if (!Array.isArray(input.reasons)) return false;
  if (typeof input.summary !== "string") return false;
  if (!Array.isArray(input.verificationIssues)) return false;
  return true;
}

function fallbackReadiness(): GenerationReadiness {
  return {
    status: "blocked",
    blocked: true,
    reasonCodes: [],
    reasons: [],
    badgeLabel: "BLOCKED",
    summary: "Blocked",
    verificationIssues: [],
  };
}

function safeAuthorityFallback(reason: string): WorkflowSurfaceAuthorityModel {
  return {
    canonicalState: "hard_blocked",
    headline: "Something is blocking document generation.",
    body: "We couldn’t determine a safe next step from the current workflow state. Open Studio to review blockers and try again.",
    primaryAction: { label: "Open workspace", destination: "studio_workspace" },
    trustTone: "blocked",
    secondaryAction: { label: "Back to Results", destination: "results" },
    // `reason` intentionally unused in UI; it’s included via diagnostics only.
    // Keep the fallback conservative (no readiness/success implication).
  };
}

export function resolveWorkflowOrchestrator(input: WorkflowOrchestratorInput): WorkflowOrchestratorOutput {
  if (process.env.NODE_ENV !== "production") {
    console.log("[WORKFLOW][ORCHESTRATOR_INPUT]", {
      activityState: input.activity,
      artifactState: {
        artifact: input.artifact,
        resume: input.resume,
        coverLetter: input.coverLetter,
      },
      authorityState: input.workflowAuthority,
    });
  }

  const diagnosticsViolations: WorkflowContractViolation[] = [];
  const readinessMalformed = !isGenerationReadiness(input.generationReadiness);
  const safeReadiness = readinessMalformed ? fallbackReadiness() : input.generationReadiness;
  if (readinessMalformed) {
    diagnosticsViolations.push({
      violationType: "unknown_workflow_fallthrough",
      surface: input.surface,
      canonicalState: null,
      trustTone: null,
      authorityFlags: {
        unlockActive: false,
        postUnlockActive: false,
        generationReadyActive: false,
        failureActive: false,
      },
      artifactFlags: {
        stalePreviewSuppressed: false,
        stalePreviewRendered: false,
      },
      context: {
        reason: "invalid_generation_readiness_input",
      },
    });
  }

  const searchParamsString = safeSearchParamsString(input.searchParamsString);
  const unlockContext = resolveStudioUnlockContext({ toString: () => searchParamsString });
  const unlockDismissed = Boolean(input.unlockDismissed);
  const unlockFlowActive =
    input.surface === "studio" &&
    unlockContext.isUnlockFlow &&
    unlockContext.missingEvidence.length > 0 &&
    !unlockDismissed;

  const unlockReanalysisFailureModel =
    input.surface === "studio" && unlockFlowActive && input.unlockReanalysisFailure
      ? resolvePostUnlockOutcome({
          reanalysisFailed: true,
          priorScore: input.unlockReanalysisFailure.priorScore,
          newScore: null,
          priorReadiness: input.unlockReanalysisFailure.priorReadiness,
          newReadiness: null,
          generationAllowedNow: false,
          returnToEvidenceHref: input.unlockReanalysisFailure.returnToEvidenceHref,
        })
      : null;

  const postUnlockActive =
    input.surface === "studio" &&
    input.postUnlock.active &&
    !input.postUnlock.dismissed &&
    !unlockFlowActive;
  const postUnlockOutcomeModel = postUnlockActive
    ? resolvePostUnlockOutcome({
        reanalysisFailed: input.postUnlock.reanalysisFailed,
        priorScore: input.postUnlock.priorScore,
        newScore: typeof input.score === "number" ? input.score : null,
        priorReadiness: input.postUnlock.priorReadiness,
        newReadiness: input.postUnlock.newReadiness ?? normalizeReadiness(input.generationReadiness),
        generationAllowedNow: input.postUnlock.generationAllowedNow,
        returnToEvidenceHref: input.postUnlock.returnToEvidenceHref,
      })
    : null;

  const contract = (() => {
    try {
      return resolveWorkflowAuthorityContract({
        surface: input.surface,
        currentPathname: null,
        ids: input.ids ?? undefined,
        baselineReady: true,
        analysisExists: true,
        score: typeof input.score === "number" ? input.score : null,
        generationReadiness: {
          status: safeReadiness.status,
          blocked: safeReadiness.blocked,
          reasonCodes: safeReadiness.reasonCodes,
        },
        workflowAuthorityOverride: input.workflowAuthority,
        artifact: {
          resume: { hasOutput: false, failed: input.resume.status === "failed", status: String(input.resume.status) },
          coverLetter: {
            hasOutput: false,
            failed: input.coverLetter.status === "failed",
            status: String(input.coverLetter.status),
          },
          pair: {
            status: input.artifact.pairStatus ?? null,
            generating: input.artifact.generating,
            failure: input.artifact.failure,
          },
        },
        opportunity: null,
        contexts: {
          unlockContext:
            input.surface === "studio"
              ? { active: unlockFlowActive, hasMissingEvidence: unlockContext.missingEvidence.length > 0 }
              : null,
          postUnlockOutcomeState: postUnlockOutcomeModel?.outcomeState ?? null,
          generationReady: { active: !input.generationReady.dismissed, phase: input.generationReady.phase },
        },
      });
    } catch (error) {
      diagnosticsViolations.push({
        violationType: "unknown_workflow_fallthrough",
        surface: input.surface,
        canonicalState: null,
        trustTone: null,
        authorityFlags: {
          unlockActive: unlockFlowActive,
          postUnlockActive: postUnlockActive,
          generationReadyActive: !input.generationReady.dismissed,
          failureActive: false,
        },
        artifactFlags: {
          stalePreviewSuppressed: false,
          stalePreviewRendered: false,
        },
        context: {
          reason: "workflow_authority_contract_failed",
          error: error instanceof Error ? error.message : String(error),
        },
      });

      const fallback: WorkflowAuthorityContract = {
        contractVersion: 1,
        route: { pathname: null, module: null },
        ids: {},
        score: typeof input.score === "number" ? input.score : null,
        readiness: { status: "unknown", blocked: true, blockers: [] },
        artifacts: { resume: "missing", coverLetter: "missing", pair: "missing", hasAnyOutput: false },
        generation: {
          state: "blocked",
          auto: { shouldStart: false, signature: "autoGen:v1:fallback", skipReason: "contract_failed" },
        },
        opportunityTracking: { hasSavedOpportunity: false, materialsGenerated: false },
        stepper: {
          baseline: "available",
          analysis: "available",
          fitReview: "available",
          studio: "available",
          opportunities: "available",
          results: "available",
        },
        authority: {
          workflowState: input.workflowAuthority.workflowState,
          primaryAction: input.workflowAuthority.primaryAction,
          canGenerate: Boolean((input.workflowAuthority as any)?.canGenerate),
          surface: safeAuthorityFallback("contract_failed"),
          primaryCta: { label: "Open workspace", destination: "studio_workspace" },
        },
        diagnostics: { surface: input.surface, violations: ["workflow_authority_contract_failed"] },
      };
      return fallback;
    }
  })();

  const authority = contract.authority.surface;

  let authorityState: WorkflowSurfaceAuthorityModel = authority;
  if (readinessMalformed) {
    authorityState = safeAuthorityFallback("invalid_readiness_input");
  }
  if (unlockFlowActive && authority.canonicalState !== "unlock_required") {
    diagnosticsViolations.push({
      violationType: "unknown_workflow_fallthrough",
      surface: input.surface,
      canonicalState: authority.canonicalState,
      trustTone: authority.trustTone,
      authorityFlags: {
        unlockActive: true,
        postUnlockActive: postUnlockActive,
        generationReadyActive: false,
        failureActive: false,
      },
      artifactFlags: {
        stalePreviewSuppressed: false,
        stalePreviewRendered: false,
      },
      context: {
        reason: "unlock_flow_active_but_authority_not_unlock_required",
        actual_state: authority.canonicalState,
      },
    });
    authorityState = safeAuthorityFallback("unlock_mismatch");
  }

  if (postUnlockActive && authority.canonicalState !== "post_unlock_outcome") {
    diagnosticsViolations.push({
      violationType: "unknown_workflow_fallthrough",
      surface: input.surface,
      canonicalState: authority.canonicalState,
      trustTone: authority.trustTone,
      authorityFlags: {
        unlockActive: unlockFlowActive,
        postUnlockActive: true,
        generationReadyActive: false,
        failureActive: false,
      },
      artifactFlags: {
        stalePreviewSuppressed: false,
        stalePreviewRendered: false,
      },
      context: {
        reason: "post_unlock_active_but_authority_not_post_unlock_outcome",
        actual_state: authority.canonicalState,
      },
    });
    authorityState = safeAuthorityFallback("post_unlock_mismatch");
  }

  const generationRunning =
    Boolean(input.activity?.isActive) &&
    Array.isArray(input.activity?.activeOperations) &&
    input.activity.activeOperations.includes("generation_running");
  const artifactGenerating =
    Boolean(input.artifact.generating) ||
    input.resume.status === "generating" ||
    input.coverLetter.status === "generating" ||
    String(input.artifact.pairStatus ?? "").toLowerCase() === "generating" ||
    String(input.artifact.pairStatus ?? "").toLowerCase() === "in_progress";
  const shouldPromoteGenerationInProgress =
    !safeReadiness.blocked &&
    input.workflowAuthority.workflowState !== "BLOCKED" &&
    !unlockFlowActive &&
    !postUnlockActive &&
    (generationRunning || artifactGenerating);
  if (shouldPromoteGenerationInProgress) {
    authorityState = {
      canonicalState: "generation_in_progress",
      headline: "Generating your documents...",
      body: "We're building your tailored resume and cover letter now.",
      primaryAction: { label: "Open workspace", destination: "studio_workspace" },
      trustTone: "in_progress",
    };
  }

  const normalizedArtifacts = normalizeWorkflowArtifactState({
    resume: {
      status: input.resume.status,
      confidence: input.resume.confidence,
      failure: input.resume.failure ?? null,
    },
    coverLetter: {
      status: input.coverLetter.status,
      confidence: input.coverLetter.confidence,
      failure: input.coverLetter.failure ?? null,
    },
    artifactQuality: input.artifactQuality ?? null,
    workflowCanonicalState: authorityState.canonicalState,
    workflowTrustTone: authorityState.trustTone,
    workflowIsBlocked: authorityState.trustTone === "blocked",
    allowStalePreview: Boolean(input.allowStaleArtifactPreview),
  });

  const generationReadyModel = resolveStudioGenerationReadyModel({
    postUnlockOutcomeState: postUnlockOutcomeModel?.outcomeState ?? null,
    workflowState: input.workflowAuthority.workflowState,
    workflowPrimaryAction: input.workflowAuthority.primaryAction,
    readiness: input.generationReadiness,
    fitScore: typeof input.score === "number" ? input.score : null,
    pairStatus: (input.artifact.pairStatus ?? null) as string | null,
    hasAnyUsableOutput: Boolean(input.artifact.hasResume || input.artifact.hasCoverLetter),
    hasBlockingAuthority: Boolean(unlockFlowActive || postUnlockActive || input.workflowAuthority.workflowState === "BLOCKED"),
    resumeFailure: input.resumeFailure,
    coverFailure: input.coverFailure,
  });

  const generationReadyPriority =
    input.surface === "studio" &&
    !input.generationReady.dismissed &&
    Boolean(generationReadyModel.isGenerationReadyPriority) &&
    !unlockFlowActive &&
    !postUnlockActive;

  if (process.env.NODE_ENV !== "production") {
    console.log("[WORKFLOW][ORCHESTRATOR_OUTPUT]", {
      canonicalState: authorityState.canonicalState,
    });
  }

  return {
    authorityState: authorityState,
    contract,
    artifactState: normalizedArtifacts,
    activityState: input.activity,
    diagnostics: diagnosticsViolations.length ? { violations: diagnosticsViolations } : undefined,
    unlockState: {
      context: unlockContext,
      isUnlockFlowActive: unlockFlowActive,
    },
    postUnlockState: {
      active: postUnlockActive,
      model: postUnlockOutcomeModel,
    },
    unlockReanalysisFailureState: {
      model: unlockReanalysisFailureModel,
    },
    generationReadyState: {
      model: generationReadyModel,
      isPriority: generationReadyPriority,
    },
  };
}
