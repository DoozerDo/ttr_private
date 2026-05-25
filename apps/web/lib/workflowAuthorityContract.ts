import type { GenerationReadiness } from "@/lib/generationReadiness";
import type { WorkflowAuthorityResult, WorkflowAuthorityPrimaryAction, WorkflowAuthorityState } from "@/lib/resolveWorkflowAuthority";
import type { WorkflowSurfaceAuthorityModel } from "@/lib/workflowSurfaceAuthorityModel";
import type { PostUnlockOutcomeState } from "@/lib/postUnlockOutcomeModel";

import { resolveWorkflowAuthority } from "@/lib/resolveWorkflowAuthority";
import { resolveWorkflowSurfaceAuthority } from "@/lib/workflowSurfaceAuthority";

export type WorkflowModuleKey = "baseline" | "analysis" | "fitReview" | "studio" | "opportunities" | "results";

export type WorkflowModuleState = "locked" | "available" | "current" | "complete";

export type WorkflowReadinessStatus = "ready" | "limited" | "blocked" | "unknown";

export type WorkflowArtifactState = "missing" | "generating" | "generated" | "failed";

export type WorkflowGenerationState =
  | "blocked"
  | "ready"
  | "generating"
  | "generated"
  | "failed_retryable"
  | "failed_blocked";

export type WorkflowNextActionDestination =
  | "fit_review"
  | "studio_unlock"
  | "studio_generate"
  | "studio_workspace"
  | "results"
  | "opportunities";

export type WorkflowPrimaryCta = {
  label: string;
  destination: WorkflowNextActionDestination;
  testId?: string;
};

export type WorkflowAutoGenerationDecision =
  | { shouldStart: true; signature: string }
  | { shouldStart: false; signature: string; skipReason: string };

export type WorkflowAuthorityContract = {
  contractVersion: 1;
  route: {
    pathname: string | null;
    module: WorkflowModuleKey | null;
  };
  ids: {
    baselineId?: string | null;
    baselineVersionId?: string | null;
    jobId?: string | null;
    assessmentId?: string | null;
    analysisId?: string | null;
  };
  score: number | null;
  readiness: {
    status: WorkflowReadinessStatus;
    blocked: boolean;
    blockers: string[];
  };
  artifacts: {
    resume: WorkflowArtifactState;
    coverLetter: WorkflowArtifactState;
    pair: WorkflowArtifactState;
    hasAnyOutput: boolean;
  };
  generation: {
    state: WorkflowGenerationState;
    auto: WorkflowAutoGenerationDecision;
    debug: {
      readinessStatus: WorkflowReadinessStatus;
      readinessBlocked: boolean;
      blockers: string[];
      workflowState: WorkflowAuthorityState;
      workflowPrimaryAction: WorkflowAuthorityPrimaryAction;
      surfaceCanonicalState: WorkflowSurfaceAuthorityModel["canonicalState"];
      canGenerate: boolean;
    };
  };
  opportunityTracking: {
    hasSavedOpportunity: boolean;
    materialsGenerated: boolean;
  };
  stepper: Record<WorkflowModuleKey, WorkflowModuleState>;
  authority: {
    workflowState: WorkflowAuthorityState;
    primaryAction: WorkflowAuthorityPrimaryAction;
    canGenerate: boolean;
    surface: WorkflowSurfaceAuthorityModel;
    primaryCta: WorkflowPrimaryCta;
  };
  diagnostics: {
    surface: "results" | "studio" | "app_shell" | "unknown";
    violations: string[];
  };
};

function normalizeScore(score: unknown): number | null {
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

function normalizeReadinessStatus(readiness: Pick<GenerationReadiness, "status" | "blocked" | "reasonCodes"> | null): {
  status: WorkflowReadinessStatus;
  blocked: boolean;
  blockers: string[];
} {
  if (!readiness) return { status: "unknown", blocked: true, blockers: [] };
  const status = readiness.status === "ready" || readiness.status === "limited" || readiness.status === "blocked"
    ? readiness.status
    : "unknown";
  const blocked = Boolean(readiness.blocked || status === "blocked");
  return { status, blocked, blockers: safeStringArray(readiness.reasonCodes) };
}

function detectRouteModule(pathname: string | null): WorkflowModuleKey | null {
  if (!pathname) return null;
  if (pathname === "/baseline" || pathname.startsWith("/baseline/")) return "baseline";
  if (pathname === "/target" || pathname.startsWith("/target/") || pathname === "/analyze" || pathname.startsWith("/analyze/")) {
    return "analysis";
  }
  if (pathname === "/fit-review" || pathname.startsWith("/fit-review/")) return "fitReview";
  if (pathname === "/studio" || pathname.startsWith("/studio/")) return "studio";
  if (pathname === "/opportunities" || pathname.startsWith("/opportunities/") || pathname === "/job-tracker" || pathname.startsWith("/job-tracker/")) {
    return "opportunities";
  }
  if (pathname === "/results" || pathname.startsWith("/results/")) return "results";
  return null;
}

function toArtifactState(status: unknown, opts?: { hasOutput?: boolean; failed?: boolean }): WorkflowArtifactState {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (normalized === "completed" || normalized === "ready" || opts?.hasOutput) return "generated";
  if (normalized === "in_progress" || normalized === "generating") return "generating";
  if (normalized === "failed" || normalized === "generation_failed" || opts?.failed) return "failed";
  return "missing";
}

function derivePairState(resume: WorkflowArtifactState, coverLetter: WorkflowArtifactState): WorkflowArtifactState {
  if (resume === "generated" && coverLetter === "generated") return "generated";
  if (resume === "failed" || coverLetter === "failed") return "failed";
  if (resume === "generating" || coverLetter === "generating") return "generating";
  return "missing";
}

function resolveGenerationState(input: {
  readinessBlocked: boolean;
  canGenerate: boolean;
  surfaceCanonicalState: WorkflowSurfaceAuthorityModel["canonicalState"];
  artifactsPair: WorkflowArtifactState;
  retryableFailure: boolean;
}): WorkflowGenerationState {
  if (input.artifactsPair === "generated") return "generated";
  // Readiness is a preflight gate. However, the `canGenerate` signal already incorporates the product
  // score contract (e.g. score >= 80 is a "generate now" lane even when readiness is limited).
  // Do not double-block here, or the UI can enter a contradictory state ("ready to generate" + "not ready yet").
  if (!input.canGenerate) return "blocked";
  if (input.surfaceCanonicalState === "generation_in_progress" || input.artifactsPair === "generating") return "generating";
  if (input.surfaceCanonicalState === "generation_ready") return "ready";
  if (input.surfaceCanonicalState === "generation_failed" || input.artifactsPair === "failed") {
    return input.retryableFailure ? "failed_retryable" : "failed_blocked";
  }
  // Conservative default: if we can generate but aren't in an explicit state, treat as blocked-until-ready.
  return "blocked";
}

function resolvePrimaryCtaFromSurface(surface: WorkflowSurfaceAuthorityModel): WorkflowPrimaryCta {
  switch (surface.primaryAction.destination) {
    case "fit_review":
      return { label: surface.primaryAction.label, destination: "fit_review" };
    case "studio_unlock":
      return { label: surface.primaryAction.label, destination: "studio_unlock" };
    case "studio_generate":
      return { label: surface.primaryAction.label, destination: "studio_generate" };
    case "studio_workspace":
      return { label: surface.primaryAction.label, destination: "studio_workspace" };
    case "results":
    default:
      return { label: surface.primaryAction.label, destination: "results" };
  }
}

function buildAutoGenerationSignature(ids: WorkflowAuthorityContract["ids"]): string {
  const baselineVersion = ids.baselineVersionId ?? "unknown_baseline_version";
  const job = ids.jobId ?? "unknown_job";
  const assessment = ids.assessmentId ?? ids.analysisId ?? "unknown_assessment";
  return `autoGen:v1:${baselineVersion}:${job}:${assessment}`;
}

function hasRequiredAutoGenerationIds(ids: WorkflowAuthorityContract["ids"]): boolean {
  const baselineVersionOk = Boolean((ids.baselineVersionId ?? "").trim());
  const jobOk = Boolean((ids.jobId ?? "").trim());
  // Studio auto-generation must be able to proceed when analysisId is absent as long as
  // baselineVersionId + jobId are present and the backend can resolve the latest assessment.
  // In that case, /api/studio/artifacts is the source of truth for score + readiness.
  return baselineVersionOk && jobOk;
}

export function resolveWorkflowAuthorityContract(input: {
  surface?: WorkflowAuthorityContract["diagnostics"]["surface"];
  currentPathname?: string | null;

  ids?: WorkflowAuthorityContract["ids"];

  baselineReady: boolean;
  analysisExists: boolean;
  score: number | null;
  generationReadiness: Pick<GenerationReadiness, "status" | "blocked" | "reasonCodes"> | null;
  workflowAuthorityOverride?: Pick<WorkflowAuthorityResult, "workflowState" | "primaryAction" | "canGenerate" | "suppressFailureMessaging"> | null;

  artifact: {
    resume?: { hasOutput?: boolean; failed?: boolean; status?: string | null } | null;
    coverLetter?: { hasOutput?: boolean; failed?: boolean; status?: string | null } | null;
    pair?: { status?: string | null; generating?: boolean; failure?: { retryable?: boolean | null } | null } | null;
  };

  opportunity?: { hasSavedOpportunity?: boolean; materialsGenerated?: boolean } | null;

  contexts?: {
    unlockContext?: { active: boolean; hasMissingEvidence: boolean } | null;
    postUnlockOutcomeState?: PostUnlockOutcomeState | null;
  } | null;
}): WorkflowAuthorityContract {
  const pathname = typeof input.currentPathname === "string" ? input.currentPathname : null;
  const routeModule = detectRouteModule(pathname);

  const ids = input.ids ?? {};

  const score = normalizeScore(input.score);
  const readiness = normalizeReadinessStatus(input.generationReadiness);

  const resumeArtifact = input.artifact.resume ?? null;
  const coverArtifact = input.artifact.coverLetter ?? null;
  const pairArtifact = input.artifact.pair ?? null;

  const resumeState = toArtifactState(resumeArtifact?.status, {
    hasOutput: Boolean(resumeArtifact?.hasOutput),
    failed: Boolean(resumeArtifact?.failed),
  });
  const coverState = toArtifactState(coverArtifact?.status, {
    hasOutput: Boolean(coverArtifact?.hasOutput),
    failed: Boolean(coverArtifact?.failed),
  });

  const pairStateFromBackend = toArtifactState(pairArtifact?.status, {
    hasOutput: resumeState === "generated" && coverState === "generated",
    failed: Boolean(resumeState === "failed" || coverState === "failed"),
  });
  const pairState = pairStateFromBackend === "missing" ? derivePairState(resumeState, coverState) : pairStateFromBackend;
  const hasAnyOutput = resumeState === "generated" || coverState === "generated";

  const workflowAuthority: WorkflowAuthorityResult = input.workflowAuthorityOverride
    ? {
        workflowState: input.workflowAuthorityOverride.workflowState,
        primaryAction: input.workflowAuthorityOverride.primaryAction,
        canGenerate: input.workflowAuthorityOverride.canGenerate,
        suppressFailureMessaging: input.workflowAuthorityOverride.suppressFailureMessaging,
        headline: "",
        body: "",
        nextStepHint: "",
      }
    : resolveWorkflowAuthority({
        score,
        generationReadiness: {
          status: readiness.status === "unknown" ? "blocked" : readiness.status,
          blocked: readiness.blocked,
          badgeLabel:
            readiness.status === "ready" ? "READY" : readiness.status === "limited" ? "LIMITED" : "BLOCKED",
          reasonCodes: readiness.blockers,
          reasons: [],
          summary: "",
          verificationIssues: [],
        },
        resumeState: { hasOutput: resumeState === "generated", failed: resumeState === "failed" },
        coverState: { hasOutput: coverState === "generated", failed: coverState === "failed" },
        isPro: false,
        hasGeneratedOnce: hasAnyOutput,
        isHydrating: false,
      });

  const surfaceAuthority = resolveWorkflowSurfaceAuthority({
    score,
    generationReadiness: {
      status: readiness.status === "unknown" ? "blocked" : readiness.status,
      blocked: readiness.blocked,
      badgeLabel: readiness.status === "ready" ? "READY" : readiness.status === "limited" ? "LIMITED" : "BLOCKED",
      reasonCodes: readiness.blockers,
      reasons: [],
      summary: "",
      verificationIssues: [],
    },
    workflowAuthority,
    artifact: {
      hasResume: resumeState === "generated",
      hasCoverLetter: coverState === "generated",
      pairStatus: pairArtifact?.status ?? pairState,
      generating: Boolean(pairArtifact?.generating) || pairState === "generating",
      failure: pairArtifact?.failure ?? null,
    },
    unlockContext: input.contexts?.unlockContext ?? null,
    postUnlockOutcomeState: input.contexts?.postUnlockOutcomeState ?? null,
  });

  const retryableFailure = Boolean(pairArtifact?.failure?.retryable);
  const generationState = resolveGenerationState({
    readinessBlocked: readiness.blocked,
    canGenerate: workflowAuthority.canGenerate,
    surfaceCanonicalState: surfaceAuthority.canonicalState,
    artifactsPair: pairState,
    retryableFailure,
  });

  const autoGenSignature = buildAutoGenerationSignature(ids);
  const hasRequiredIds = hasRequiredAutoGenerationIds(ids);
  const autoDecision: WorkflowAutoGenerationDecision =
    generationState === "ready" && hasRequiredIds && pairState !== "generating" && pairState !== "generated"
      ? { shouldStart: true, signature: autoGenSignature }
      : {
          shouldStart: false,
          signature: autoGenSignature,
          skipReason:
            !hasRequiredIds
              ? "missing_required_ids"
              : generationState === "ready"
                ? "ready_but_ineligible"
                :
            generationState === "generated"
              ? "artifacts_already_generated"
              : generationState === "generating"
                ? "generation_in_progress"
                : generationState === "blocked"
                  ? "not_ready_or_blocked"
                  : generationState.startsWith("failed")
                    ? "generation_failed"
                    : "unknown",
        };

  const hasSavedOpportunity = Boolean(input.opportunity?.hasSavedOpportunity);
  const materialsGenerated = Boolean(input.opportunity?.materialsGenerated || pairState === "generated");

  const baselineState: WorkflowModuleState = routeModule === "baseline" ? "current" : input.baselineReady ? "complete" : "locked";
  const analysisState: WorkflowModuleState =
    routeModule === "analysis"
      ? "current"
      : !input.baselineReady
        ? "locked"
        : input.analysisExists
          ? "complete"
          : "available";
  const fitReviewState: WorkflowModuleState =
    !input.analysisExists
      ? "locked"
      : routeModule === "fitReview"
        ? "current"
        : readiness.status === "ready" && !readiness.blocked
          ? "complete"
          : "available";

  const hasBaselineResumeV2Blocker = readiness.blockers.some((code) => String(code ?? "").startsWith("baseline_resume_v2_"));
  const studioEligible = workflowAuthority.canGenerate || hasAnyOutput;
  const studioState: WorkflowModuleState =
    routeModule === "studio"
      ? // Contract guard: Studio must never be CURRENT when structural ResumeV2 authority is blocked
        // (even if the user deep-links to `/studio`).
        hasBaselineResumeV2Blocker
        ? "locked"
        : "current"
      : !studioEligible
        ? "locked"
        : pairState === "generated"
          ? "complete"
          : "available";

  const opportunitiesState: WorkflowModuleState =
    routeModule === "opportunities"
      ? "current"
      : !studioEligible
        ? "locked"
        : hasSavedOpportunity
          ? "available"
          : "available";

  const resultsState: WorkflowModuleState = routeModule === "results" ? "current" : "available";

  const stepper: Record<WorkflowModuleKey, WorkflowModuleState> = {
    baseline: baselineState,
    analysis: analysisState,
    fitReview: fitReviewState,
    studio: studioState,
    opportunities: opportunitiesState,
    results: resultsState,
  };

  // Deep-link friendliness: if the user lands on a locked route, reflect that module as CURRENT
  // so the UI can explain the gate — except Studio, where structural ResumeV2 baseline failures
  // must redirect attention back to baseline repair and must not advertise "current/unlocked" Studio.
  if (routeModule && stepper[routeModule] === "locked" && routeModule !== "studio") {
    stepper[routeModule] = "current";
  }

  if (routeModule === "studio" && hasBaselineResumeV2Blocker) {
    stepper.baseline = "current";
  }

  const surfaceCta = resolvePrimaryCtaFromSurface(surfaceAuthority);

  return {
    contractVersion: 1,
    route: { pathname, module: routeModule },
    ids,
    score,
    readiness,
    artifacts: {
      resume: resumeState,
      coverLetter: coverState,
      pair: pairState,
      hasAnyOutput,
    },
    opportunityTracking: { hasSavedOpportunity, materialsGenerated },
    stepper,
    authority: {
      workflowState: workflowAuthority.workflowState,
      primaryAction: workflowAuthority.primaryAction,
      canGenerate: workflowAuthority.canGenerate,
      surface: surfaceAuthority,
      primaryCta: surfaceCta,
    },
    generation: {
      state: generationState,
      auto: autoDecision,
      debug: {
        readinessStatus: readiness.status,
        readinessBlocked: readiness.blocked,
        blockers: readiness.blockers,
        workflowState: workflowAuthority.workflowState,
        workflowPrimaryAction: workflowAuthority.primaryAction,
        surfaceCanonicalState: surfaceAuthority.canonicalState,
        canGenerate: workflowAuthority.canGenerate,
      },
    },
    diagnostics: {
      surface: input.surface ?? "unknown",
      violations: [],
    },
  };
}
