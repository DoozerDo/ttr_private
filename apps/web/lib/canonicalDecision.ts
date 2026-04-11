import type { BaselineAssessmentSummaryDto } from "@/lib/baselines";
import type { GenerationReadiness } from "@/lib/generationReadiness";
import type { GenerationProductReadiness } from "@/lib/generationProductReadiness";
import type { DecisionFlowDataSource } from "@/lib/decisionFlowDebug";
import {
  resolveWorkflowProgression,
  type WorkflowBlockingReason,
  type WorkflowPrimaryAction,
  type WorkflowProgressionInput,
  type WorkflowState,
} from "@/lib/workflowProgression";

export type CanonicalSurface = "baseline" | "target" | "results" | "studio";

export type CanonicalReadinessState =
  | "NOT_ANALYZED"
  | "ANALYZING"
  | "READY"
  | "LIMITED"
  | "BLOCKED"
  | "IMPROVE"
  | "DRAFT";

export type CanonicalActionType =
  | "upload_resume"
  | "target_role"
  | "view_results"
  | "resolve_gaps"
  | "fit_review"
  | "open_studio_generate"
  | "open_studio"
  | "studio"
  | "studio_with_save";

export type CanonicalNextAction = {
  type: CanonicalActionType;
  label: string;
  route: string;
  reason: string;
};

export type CanonicalCta = {
  label: string;
  href: string;
  actionType: CanonicalActionType;
};

export type AnalysisTargetPair = {
  assessmentId?: string | null;
  baselineId?: string | null;
  jobId?: string | null;
  baselineVersionId?: string | null;
  score?: number | null;
};

type DecisionCandidate<T> = {
  source: string;
  value: T | null | undefined;
};

type BaselineRoutes = {
  baseline: string;
  target: string;
  results: string;
  upload: string;
};

export type CanonicalDecisionResult = {
  surface: CanonicalSurface;
  score: number | null;
  readinessState: CanonicalReadinessState;
  scoreSource: string;
  readinessSource: string;
  nextAction: CanonicalNextAction;
  cta: CanonicalCta;
  workflowState: WorkflowState;
  primaryAction: WorkflowPrimaryAction;
  blockingReason: WorkflowBlockingReason | null;
  supportingMessage: string;
  pairKey: string | null;
  dataSource: DecisionFlowDataSource;
  persistedAssessmentId: string | null;
  contractSource: string;
};

export type ResolveCanonicalStateInput =
  | {
      surface: "baseline";
    baselineId: string | null;
    summary?: BaselineAssessmentSummaryDto | null;
    isAnalyzing?: boolean;
    routes: BaselineRoutes;
      dataSource?: DecisionFlowDataSource;
      persistedAssessmentId?: string | null;
    }
  | {
      surface: "target";
      baselineId: string | null;
      jobId: string | null;
      score: number | null;
      generationReadiness: GenerationReadiness;
      productReadiness: GenerationProductReadiness;
      studioHref: string;
      resolveGapsHref: string;
      dataSource?: DecisionFlowDataSource;
      persistedAssessmentId?: string | null;
      scoreCandidates?: Array<DecisionCandidate<number | null>>;
      analysisCandidates?: Array<DecisionCandidate<AnalysisTargetPair>>;
    }
  | {
      surface: "results";
      baselineId: string | null;
      jobId: string | null;
      score: number | null;
      generationReadiness: GenerationReadiness;
      productReadiness: GenerationProductReadiness;
      studioHref: string;
      fitReviewHref: string;
      forceFitReview?: boolean;
      dataSource?: DecisionFlowDataSource;
      persistedAssessmentId?: string | null;
      scoreCandidates?: Array<DecisionCandidate<number | null>>;
      analysisCandidates?: Array<DecisionCandidate<AnalysisTargetPair>>;
    }
  | {
      surface: "studio";
      baselineId: string | null;
      jobId: string | null;
      score: number | null;
      generationReadiness: GenerationReadiness;
      productReadiness: GenerationProductReadiness;
      resultsHref: string;
      fitReviewHref: string;
      canGenerateDocuments: boolean;
      opportunityAlreadySaved?: boolean;
      dataSource?: DecisionFlowDataSource;
      persistedAssessmentId?: string | null;
      scoreCandidates?: Array<DecisionCandidate<number | null>>;
      analysisCandidates?: Array<DecisionCandidate<AnalysisTargetPair>>;
    };

function shouldFailOnMismatch() {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_DECISION_FLOW === "true";
}

function serializeCandidateValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function assertNoMismatch<T>(label: string, candidates: Array<DecisionCandidate<T>>) {
  const defined = candidates.filter((candidate) => candidate.value !== undefined && candidate.value !== null);
  if (defined.length <= 1) {
    return defined[0] ?? null;
  }

  const canonical = defined[0]!;
  const mismatches = defined.slice(1).filter((candidate) => !Object.is(candidate.value, canonical.value));
  if (!mismatches.length) {
    return canonical;
  }

  const message =
    `[canonical-decision] ${label} mismatch: ` +
    defined.map((candidate) => `${candidate.source}=${serializeCandidateValue(candidate.value)}`).join(", ");
  if (shouldFailOnMismatch()) {
    throw new Error(message);
  }
  console.error(message);
  return canonical;
}

function scoreLabel(score: number | null): string {
  if (typeof score !== "number" || Number.isNaN(score)) return "score unavailable";
  return `score ${Math.round(score)}`;
}

function buildBaselineNextAction(input: {
  readinessState: CanonicalReadinessState;
  latestAssessmentId: string | null;
  routes: BaselineRoutes;
}): CanonicalNextAction {
  if (input.readinessState === "ANALYZING") {
    return {
      type: "upload_resume",
      label: "Upload Another Resume",
      route: input.routes.upload,
      reason: "baseline still analyzing",
    };
  }

  if (input.readinessState === "READY") {
    return {
      type: "target_role",
      label: "Target a role",
      route: input.routes.target,
      reason: "baseline ready for targeting",
    };
  }

  if (input.latestAssessmentId) {
    return {
      type: "view_results",
      label: "View Latest Results",
      route: input.routes.results,
      reason: "baseline has latest assessment",
    };
  }

  return {
    type: "upload_resume",
    label: "Upload Another Resume",
    route: input.routes.baseline,
    reason: "baseline not analyzed",
  };
}

function buildAnalysisNextAction(input: {
  surface: "target" | "results" | "studio";
  score: number | null;
  generationReadiness: GenerationReadiness;
  productReadiness: GenerationProductReadiness;
  fitReviewHref: string;
  studioHref?: string;
  resultsHref?: string;
  canGenerateDocuments?: boolean;
  forceFitReview?: boolean;
}): CanonicalNextAction {
  const score = typeof input.score === "number" && Number.isFinite(input.score) ? input.score : null;
  const qualifiedForGeneration = score !== null && score >= 80;

  if (input.surface === "target") {
    if (!qualifiedForGeneration) {
      return {
        type: "resolve_gaps",
        label: "Start Fit Review",
        route: input.fitReviewHref,
        reason: score === null ? "score unavailable" : "score below 80",
      };
    }

    if (input.productReadiness.canOpenStudio) {
      return {
        type: "open_studio_generate",
        label: "Open Studio",
        route: input.studioHref ?? "/studio",
        reason: "ready to generate from target",
      };
    }

    return {
      type: "resolve_gaps",
      label: "Start Fit Review",
      route: input.fitReviewHref,
      reason: "generation blocked",
    };
  }

  if (input.surface === "results") {
    if (input.forceFitReview || !qualifiedForGeneration) {
      return {
        type: "fit_review",
        label: "Start Fit Review",
        route: input.fitReviewHref,
        reason: input.forceFitReview ? "forced fit review" : score === null ? "score unavailable" : "score below 80",
      };
    }

    if (!input.productReadiness.canOpenStudio) {
      return {
        type: "fit_review",
        label: "Start Fit Review",
        route: input.fitReviewHref,
        reason: "generation not truly ready",
      };
    }

    if (score !== null && score >= 90) {
      return {
        type: "open_studio",
        label: "Open Studio",
        route: input.studioHref ?? "/studio",
        reason: "strong fit with verified evidence",
      };
    }

    return {
      type: "open_studio",
      label: "Open Studio",
      route: input.studioHref ?? "/studio",
      reason: "qualified fit ready for Studio",
    };
  }

  if (!qualifiedForGeneration || !input.canGenerateDocuments || !input.productReadiness.canOpenStudio) {
    return {
      type: "fit_review",
      label: "Start Fit Review",
      route: input.fitReviewHref,
      reason: "studio generation blocked",
    };
  }

  if (score !== null && score >= 85) {
    return {
      type: "studio_with_save",
      label: "Generate Resume",
      route: input.resultsHref ?? "/studio",
      reason: "strong fit with save path",
    };
  }

  return {
    type: "studio",
    label: "Open Resume & Cover Letter Studio",
    route: input.resultsHref ?? "/studio",
    reason: "studio ready",
  };
}

export function resolveNextAction(input: ResolveCanonicalStateInput): CanonicalNextAction {
  if (input.surface === "baseline") {
    const hasCompletedAssessment = Boolean(input.summary && input.summary.latestAssessmentId);
    const readinessState: CanonicalReadinessState = input.isAnalyzing
      ? "ANALYZING"
      : hasCompletedAssessment
        ? "READY"
        : "NOT_ANALYZED";
    return buildBaselineNextAction({
      readinessState,
      latestAssessmentId: input.summary?.latestAssessmentId?.trim() ?? null,
      routes: input.routes,
    });
  }

  return buildAnalysisNextAction({
    surface: input.surface,
    score: input.score,
    generationReadiness: input.generationReadiness,
    productReadiness: input.productReadiness,
    fitReviewHref: input.surface === "target" ? input.resolveGapsHref : input.fitReviewHref,
    studioHref: input.surface === "target" ? input.studioHref : input.surface === "results" ? input.studioHref : undefined,
    resultsHref: input.surface === "studio" ? input.resultsHref : undefined,
    canGenerateDocuments: input.surface === "studio" ? input.canGenerateDocuments : undefined,
    forceFitReview: input.surface === "results" ? input.forceFitReview : undefined,
  });
}

export function resolveCta(nextAction: CanonicalNextAction): CanonicalCta {
  return {
    label: nextAction.label,
    href: nextAction.route,
    actionType: nextAction.type,
  };
}

function verifyAnalysisAgreement(
  input:
    | Extract<ResolveCanonicalStateInput, { surface: "target" | "results" | "studio" }>
    | Extract<ResolveCanonicalStateInput, { surface: "baseline" }>,
  score: number | null,
): void {
  if (input.surface === "baseline") {
    return;
  }

  if (score !== null && score < 70) {
    const canOpenStudio = input.productReadiness.canOpenStudio;
    const ready = input.generationReadiness.status === "ready";
    const limited = input.generationReadiness.status === "limited";
    if (canOpenStudio || ready && !canOpenStudio || limited && canOpenStudio) {
      const message = `[canonical-decision] ${input.surface} readiness/score mismatch for ${scoreLabel(score)}`;
      if (shouldFailOnMismatch()) {
        throw new Error(message);
      }
      console.error(message, {
        generationReadiness: input.generationReadiness.status,
        productCanOpenStudio: input.productReadiness.canOpenStudio,
      });
    }
  }

  if (input.surface === "target") {
    if (input.generationReadiness.status === "ready" && !input.productReadiness.canOpenStudio) {
      const message = "[canonical-decision] target generation readiness ready but studio locked";
      if (shouldFailOnMismatch()) throw new Error(message);
      console.error(message);
    }
    if (input.generationReadiness.status !== "ready" && input.productReadiness.canOpenStudio) {
      const message = "[canonical-decision] target product readiness canOpenStudio without ready generation";
      if (shouldFailOnMismatch()) throw new Error(message);
      console.error(message);
    }
  }

  if (input.surface === "results" || input.surface === "studio") {
    if (!input.productReadiness.canOpenStudio && input.generationReadiness.status === "ready") {
      const message = `[canonical-decision] ${input.surface} generation ready but product readiness blocks Studio`;
      if (shouldFailOnMismatch()) throw new Error(message);
      console.error(message);
    }
  }
}

export function resolveCanonicalState(input: ResolveCanonicalStateInput): CanonicalDecisionResult {
  if (input.surface === "baseline") {
    const score = input.summary?.latestFitScore ?? null;
    const latestAssessmentId = input.summary?.latestAssessmentId?.trim() ?? null;
    const progression = resolveWorkflowProgression({
      surface: "baseline",
      baselineId: input.baselineId,
      jobId: null,
      baselineStatus: input.isAnalyzing ? "UPLOADING" : latestAssessmentId ? "READY" : "READY",
      analysisAssessmentId: latestAssessmentId,
      analysisStatus: input.isAnalyzing ? "running" : latestAssessmentId ? "complete" : "idle",
      score,
      firstRun: !input.baselineId,
      routes: {
        baseline: input.routes.baseline,
        target: input.routes.target,
        analyze: buildAnalyzeHref(input.baselineId, null),
        results: input.routes.results,
        studio: latestAssessmentId ? `/studio?assessmentId=${encodeURIComponent(latestAssessmentId)}` : "/studio",
        fitReview: latestAssessmentId
          ? `/fit-review?assessmentId=${encodeURIComponent(latestAssessmentId)}`
          : "/fit-review",
      },
      dataSource: input.dataSource ?? "fresh",
      persistedAssessmentId: input.persistedAssessmentId ?? latestAssessmentId,
    });
    const readinessState: CanonicalReadinessState = input.isAnalyzing
      ? "ANALYZING"
      : latestAssessmentId
        ? "READY"
        : "NOT_ANALYZED";
    const nextAction = resolveNextAction(input);
    return {
      surface: input.surface,
      score,
      readinessState,
      scoreSource: latestAssessmentId ? "persisted_latest_assessment" : "fallback_default",
      readinessSource: input.isAnalyzing ? "fallback_default" : latestAssessmentId ? "persisted_latest_assessment" : "fallback_default",
      nextAction,
      cta: resolveCta(nextAction),
      workflowState: progression.state,
      primaryAction: progression.primaryAction,
      blockingReason: progression.blockingReason,
      supportingMessage: progression.supportingMessage,
      pairKey: progression.pairKey,
      dataSource: input.dataSource ?? "fresh",
      persistedAssessmentId: input.persistedAssessmentId ?? latestAssessmentId,
      contractSource: "resolveCanonicalState",
    };
  }

  const scoreCandidate = assertNoMismatch("score", input.scoreCandidates ?? [
    { source: "primary", value: input.score },
  ]);
  const score = scoreCandidate?.value ?? input.score ?? null;
  verifyAnalysisAgreement(input, score);
  const analysisCandidate = input.analysisCandidates?.find(
    (candidate) => candidate.value && typeof candidate.value === "object",
  )?.value;
  const routeInput = input as unknown as Record<string, string | undefined>;
  const studioCanGenerateDocuments =
    input.surface === "studio" ? input.canGenerateDocuments : false;
  const progressionRoutes: WorkflowProgressionInput["routes"] = {
    baseline: input.baselineId ? "/baseline" : "/baseline",
    target: input.baselineId ? `/target?baselineId=${encodeURIComponent(input.baselineId)}` : "/target",
    analyze: buildAnalyzeHref(input.baselineId, input.jobId),
    results:
      routeInput.resultsHref ??
      routeInput.studioHref ??
      "/results",
    studio:
      routeInput.studioHref ??
      routeInput.resultsHref ??
      "/studio",
    fitReview: routeInput.fitReviewHref ?? routeInput.resolveGapsHref ?? "/fit-review",
  };
  const workflowProgression = resolveWorkflowProgression({
    surface: input.surface,
    baselineId: input.baselineId,
    jobId: input.jobId,
    score,
    generationReadiness: input.generationReadiness,
    productReadiness: input.productReadiness,
    analysisStatus: input.surface === "results" && input.forceFitReview ? "failed" : "complete",
    firstRun: !input.baselineId && !input.jobId,
    hasJobDescription: Boolean(input.jobId),
    isGenerationBlocked:
      input.surface === "results"
        ? input.forceFitReview || score === null || score < 70 || !input.productReadiness.canOpenStudio || input.generationReadiness.status !== "ready"
        : !studioCanGenerateDocuments || !input.productReadiness.canOpenStudio,
    routes: progressionRoutes,
    dataSource: input.dataSource ?? "fresh",
    analysisAssessmentId: analysisCandidate?.assessmentId ?? input.persistedAssessmentId ?? null,
    analysisBaselineId: analysisCandidate?.baselineId ?? null,
    analysisJobId: analysisCandidate?.jobId ?? null,
    analysisBaselineVersionId: analysisCandidate?.baselineVersionId ?? null,
    persistedAssessmentId: input.persistedAssessmentId ?? null,
  });
  const qualifiedForGeneration = score !== null && score >= 80;
  const nextAction = resolveNextAction(input);
  return {
    surface: input.surface,
    score,
    readinessState:
      input.surface === "target"
        ? qualifiedForGeneration && input.productReadiness.canOpenStudio
          ? "READY"
          : qualifiedForGeneration
            ? "BLOCKED"
            : input.generationReadiness.status === "limited"
            ? "LIMITED"
            : "BLOCKED"
        : input.surface === "results"
          ? input.forceFitReview || !qualifiedForGeneration
            ? "IMPROVE"
            : !input.productReadiness.canOpenStudio
              ? "BLOCKED"
              : score !== null && score >= 90
                ? "READY"
                : "DRAFT"
          : !qualifiedForGeneration || !studioCanGenerateDocuments || !input.productReadiness.canOpenStudio
            ? "BLOCKED"
            : score !== null && score >= 90
              ? "READY"
              : "DRAFT",
    scoreSource: scoreCandidate?.source ?? "primary",
    readinessSource:
      input.surface === "target"
        ? qualifiedForGeneration && input.productReadiness.canOpenStudio
          ? "generation_ready"
          : qualifiedForGeneration
            ? "generation_blocked"
            : input.generationReadiness.status === "limited"
            ? "generation_limited"
            : "generation_blocked"
        : input.surface === "results"
          ? input.forceFitReview || !qualifiedForGeneration
            ? "generation_blocked"
            : !input.productReadiness.canOpenStudio
              ? "generation_blocked"
              : score !== null && score >= 90
                ? "generation_ready"
                : "generation_limited"
          : !qualifiedForGeneration || !studioCanGenerateDocuments || !input.productReadiness.canOpenStudio
            ? "generation_blocked"
            : score !== null && score >= 90
              ? "generation_ready"
              : "generation_limited",
    nextAction,
    cta: resolveCta(nextAction),
    workflowState: workflowProgression.state,
    primaryAction: workflowProgression.primaryAction,
    blockingReason: workflowProgression.blockingReason,
    supportingMessage: workflowProgression.supportingMessage,
    pairKey: workflowProgression.pairKey,
    dataSource: input.dataSource ?? "fresh",
    persistedAssessmentId: input.persistedAssessmentId ?? null,
    contractSource:
      input.surface === "target"
        ? "resolveCanonicalState+target"
        : input.surface === "results"
          ? "resolveCanonicalState+results"
          : "resolveCanonicalState+studio",
  };
}

export function resolveTargetDisplayResult(input: {
  currentResult: AnalysisTargetPair | null;
  persistedResult: AnalysisTargetPair | null;
  baselineId: string | null;
  jobId: string | null;
}): { result: AnalysisTargetPair | null; source: DecisionFlowDataSource } {
  const isMatch = (candidate: AnalysisTargetPair | null) =>
    Boolean(
      candidate &&
        input.baselineId &&
        input.jobId &&
        candidate.baselineId?.trim() === input.baselineId.trim() &&
        candidate.jobId?.trim() === input.jobId.trim(),
    );

  const currentMatches = isMatch(input.currentResult);
  const persistedMatches = isMatch(input.persistedResult);

  if (currentMatches && persistedMatches) {
    const current = input.currentResult!;
    const persisted = input.persistedResult!;
    if (
      !Object.is(current.assessmentId ?? null, persisted.assessmentId ?? null) ||
      !Object.is(current.score ?? null, persisted.score ?? null) ||
      !Object.is(current.baselineVersionId ?? null, persisted.baselineVersionId ?? null)
    ) {
      const message = "[canonical-decision] fresh and persisted results disagree for the active pair";
      if (shouldFailOnMismatch()) {
        throw new Error(message);
      }
      console.error(message, { current, persisted });
    }
  }

  if (currentMatches) {
    return { result: input.currentResult, source: "fresh" };
  }

  if (persistedMatches) {
    return { result: input.persistedResult, source: "persisted" };
  }

  return { result: null, source: "mixed" };
}

function buildAnalyzeHref(baselineId: string | null, jobId: string | null): string {
  const params = new URLSearchParams();
  if (baselineId?.trim()) params.set("baselineId", baselineId.trim());
  if (jobId?.trim()) params.set("jobId", jobId.trim());
  const query = params.toString();
  return query ? `/analyze?${query}` : "/analyze";
}

function mapWorkflowStateToReadinessState(
  workflowState: WorkflowState,
  score: number | null,
  productReadiness: GenerationProductReadiness | null | undefined,
  generationReadiness: GenerationReadiness | null | undefined,
  forceFitReview?: boolean,
): CanonicalReadinessState {
  const qualifiedForGeneration = score !== null && score >= 80;
  switch (workflowState) {
    case "analysis_in_progress":
    case "generation_running":
      return "ANALYZING";
    case "baseline_ready_no_job":
    case "job_present_analysis_not_started":
    case "results_unavailable":
      return "NOT_ANALYZED";
    case "first_run":
    case "no_baseline":
    case "archived_baseline_selected":
    case "invalid_navigation_state":
    case "missing_or_mismatched_pair_state":
    case "generation_failed":
    case "generation_timeout":
      return "BLOCKED";
    case "founder_excluded":
      return "BLOCKED";
    case "results_ready_studio_blocked":
    case "studio_blocked_for_evidence":
    case "generation_blocked":
      return qualifiedForGeneration ? "BLOCKED" : "IMPROVE";
    case "returning_user_persisted_last_assessment":
      return "READY";
    case "studio_ready":
      return qualifiedForGeneration && (score !== null && score >= 90 || productReadiness?.confidence === "HIGH")
        ? "READY"
        : qualifiedForGeneration
          ? "DRAFT"
          : "IMPROVE";
    case "results_ready":
      if (forceFitReview || score === null || score < 80) return "IMPROVE";
      if (!productReadiness?.canOpenStudio) return "BLOCKED";
      return score >= 90 || productReadiness?.confidence === "HIGH" ? "READY" : "DRAFT";
    default:
      return qualifiedForGeneration ? "READY" : "NOT_ANALYZED";
  }
}
