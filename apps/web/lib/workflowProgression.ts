import type { GenerationProductReadiness } from "@/lib/generationProductReadiness";
import type { GenerationReadiness } from "@/lib/generationReadiness";
import type { DecisionFlowDataSource } from "@/lib/decisionFlowDebug";

export type WorkflowSurface = "baseline" | "target" | "analyze" | "results" | "studio";

export type WorkflowState =
  | "first_run"
  | "founder_excluded"
  | "no_baseline"
  | "baseline_uploading"
  | "baseline_ready_no_job"
  | "job_present_analysis_not_started"
  | "analysis_in_progress"
  | "results_ready"
  | "results_ready_studio_blocked"
  | "studio_ready"
  | "generation_running"
  | "generation_blocked"
  | "generation_failed"
  | "generation_timeout"
  | "archived_baseline_selected"
  | "missing_or_mismatched_pair_state"
  | "returning_user_persisted_last_assessment"
  | "invalid_navigation_state"
  | "results_unavailable"
  | "studio_blocked_for_evidence";

export type WorkflowActionType =
  | "upload_resume"
  | "target_role"
  | "select_job"
  | "generate_score"
  | "view_results"
  | "start_fit_review"
  | "open_studio"
  | "generate_documents"
  | "retry_generation"
  | "recover_selection";

export type WorkflowPrimaryAction = {
  type: WorkflowActionType;
  label: string;
  destination: string;
  kind: "navigate" | "invoke";
  isEnabled: boolean;
};

export type WorkflowBlockingReason = {
  code:
    | "no_job_description"
    | "analysis_in_progress"
    | "results_unavailable"
    | "studio_blocked_for_evidence"
    | "generation_blocked"
    | "stale_pair_state"
    | "archived_baseline_selected"
    | "invalid_navigation_state"
    | "generation_timeout"
    | "generation_failed"
    | "missing_or_mismatched_pair_state";
  message: string;
  retryable: boolean;
  nextAction: string;
  destination: string;
};

export type WorkflowProgressionContract = {
  surface: WorkflowSurface;
  state: WorkflowState;
  pairKey: string | null;
  primaryAction: WorkflowPrimaryAction;
  blockingReason: WorkflowBlockingReason | null;
  nextAction: string;
  supportingMessage: string;
  dataSource: DecisionFlowDataSource;
  persistedAssessmentId: string | null;
};

export type WorkflowProgressionInput = {
  surface: WorkflowSurface;
  baselineId: string | null;
  jobId: string | null;
  baselineStatus?: "ACTIVE" | "ARCHIVED" | "UPLOADING" | "READY" | null;
  baselineVersionId?: string | null;
  analysisAssessmentId?: string | null;
  analysisBaselineId?: string | null;
  analysisJobId?: string | null;
  analysisBaselineVersionId?: string | null;
  persistedAssessmentId?: string | null;
  persistedAssessmentBaselineId?: string | null;
  persistedAssessmentJobId?: string | null;
  persistedAssessmentBaselineVersionId?: string | null;
  score?: number | null;
  generationReadiness?: GenerationReadiness | null;
  productReadiness?: GenerationProductReadiness | null;
  analysisStatus?: "idle" | "running" | "failed" | "complete" | null;
  generationStatus?: "idle" | "running" | "failed" | "timeout" | null;
  firstRun?: boolean;
  founderExcluded?: boolean;
  hasJobDescription?: boolean;
  isStalePairState?: boolean;
  isInvalidNavigationState?: boolean;
  isGenerationBlocked?: boolean;
  routes: {
    baseline: string;
    target: string;
    analyze: string;
    results: string;
    studio: string;
    fitReview: string;
  };
  dataSource?: DecisionFlowDataSource;
};

function cleanLabel(value: string | null | undefined): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : "";
}

function resolvePairKey(baselineId: string | null, jobId: string | null): string | null {
  const safeBaselineId = cleanLabel(baselineId);
  const safeJobId = cleanLabel(jobId);
  if (!safeBaselineId || !safeJobId) return null;
  return `${safeBaselineId}:${safeJobId}`;
}

function matchesPair(
  baselineId: string | null,
  jobId: string | null,
  candidateBaselineId?: string | null,
  candidateJobId?: string | null,
  candidateBaselineVersionId?: string | null,
  baselineVersionId?: string | null,
): boolean {
  if (!baselineId || !jobId) return false;
  if (cleanLabel(candidateBaselineId) !== cleanLabel(baselineId)) return false;
  if (cleanLabel(candidateJobId) !== cleanLabel(jobId)) return false;
  if (
    candidateBaselineVersionId !== undefined &&
    baselineVersionId !== undefined &&
    cleanLabel(candidateBaselineVersionId) !== cleanLabel(baselineVersionId)
  ) {
    return false;
  }
  return true;
}

function buildAction(input: {
  type: WorkflowActionType;
  label: string;
  destination: string;
  kind: "navigate" | "invoke";
  isEnabled?: boolean;
}): WorkflowPrimaryAction {
  return {
    ...input,
    isEnabled: input.isEnabled ?? true,
  };
}

function buildBlockingReason(input: {
  code: WorkflowBlockingReason["code"];
  message: string;
  retryable: boolean;
  nextAction: string;
  destination: string;
}): WorkflowBlockingReason {
  return input;
}

function buildUnsupportedState(input: WorkflowProgressionInput, state: WorkflowState): WorkflowProgressionContract {
  return {
    surface: input.surface,
    state,
    pairKey: resolvePairKey(input.baselineId, input.jobId),
    primaryAction: buildAction({
      type: "recover_selection",
      label: "Return to Baseline",
      destination: input.routes.baseline,
      kind: "navigate",
    }),
    blockingReason: buildBlockingReason({
      code: "invalid_navigation_state",
      message: "This workflow state is not valid for the current selection.",
      retryable: true,
      nextAction: "Return to Baseline",
      destination: input.routes.baseline,
    }),
    nextAction: "Return to Baseline",
    supportingMessage: "Pick a valid baseline and role pair to continue.",
    dataSource: input.dataSource ?? "fresh",
    persistedAssessmentId: input.persistedAssessmentId ?? null,
  };
}

function resolveSurfaceMessage(state: WorkflowState): string {
  switch (state) {
    case "first_run":
      return "Start by uploading a baseline resume.";
    case "founder_excluded":
      return "Founder-excluded workflows need a standard baseline before continuing.";
    case "no_baseline":
      return "Upload a baseline resume to continue.";
    case "baseline_uploading":
      return "Your baseline is still being uploaded.";
    case "baseline_ready_no_job":
      return "Your baseline is ready. Add a job description to keep going.";
    case "job_present_analysis_not_started":
      return "You have a valid baseline and role. Run analysis next.";
    case "analysis_in_progress":
      return "Analysis is running. You can safely return to Results or Baseline.";
    case "results_ready":
      return "Results are ready for review.";
    case "results_ready_studio_blocked":
      return "Results are ready, but Studio still needs stronger grounding.";
    case "studio_ready":
      return "Studio is ready for generation.";
    case "generation_running":
      return "Generation is running. Keep the pair selected while it finishes.";
    case "generation_blocked":
      return "Generation is blocked until the current gaps are resolved.";
    case "generation_failed":
      return "Generation failed. You can retry or return to Results.";
    case "generation_timeout":
      return "Generation is taking longer than expected.";
    case "archived_baseline_selected":
      return "This baseline is archived. Choose an active resume.";
    case "missing_or_mismatched_pair_state":
      return "The selected baseline and role do not match the saved assessment.";
    case "returning_user_persisted_last_assessment":
      return "Your last assessment is available for this pair.";
    case "invalid_navigation_state":
      return "This page no longer matches the current workflow state.";
    case "results_unavailable":
      return "Results are not available yet for this pair.";
    case "studio_blocked_for_evidence":
      return "Studio is blocked until the evidence is strong enough.";
  }
}

function resolvePrimaryAction(input: WorkflowProgressionInput, state: WorkflowState): WorkflowPrimaryAction {
  switch (state) {
    case "first_run":
    case "no_baseline":
      return buildAction({
        type: "upload_resume",
        label: "Upload Resume",
        destination: input.routes.baseline,
        kind: "navigate",
      });
    case "founder_excluded":
    case "archived_baseline_selected":
      return buildAction({
        type: "recover_selection",
        label: "Choose an Active Resume",
        destination: input.routes.baseline,
        kind: "navigate",
      });
    case "baseline_uploading":
      return buildAction({
        type: "upload_resume",
        label: "Back to Baseline",
        destination: input.routes.baseline,
        kind: "navigate",
      });
    case "baseline_ready_no_job":
      return buildAction({
        type: "target_role",
        label: "Target a Role",
        destination: input.routes.target,
        kind: "navigate",
      });
    case "job_present_analysis_not_started":
      return buildAction({
        type: "generate_score",
        label: "Generate Compatibility Score",
        destination: input.routes.analyze,
        kind: "invoke",
      });
    case "analysis_in_progress":
      return buildAction({
        type: "view_results",
        label: "View Results",
        destination: input.routes.results,
        kind: "navigate",
      });
    case "results_ready":
      return buildAction({
        type: "open_studio",
        label: "Open Studio",
        destination: input.routes.studio,
        kind: "navigate",
      });
    case "results_ready_studio_blocked":
    case "studio_blocked_for_evidence":
      return buildAction({
        type: "start_fit_review",
        label: "Start Fit Review",
        destination: input.routes.fitReview,
        kind: "navigate",
      });
    case "studio_ready":
      return buildAction({
        type: "generate_documents",
        label: "Generate Documents",
        destination: input.routes.studio,
        kind: "invoke",
      });
    case "generation_running":
      return buildAction({
        type: "view_results",
        label: "View Results",
        destination: input.routes.results,
        kind: "navigate",
      });
    case "generation_blocked":
      return buildAction({
        type: "start_fit_review",
        label: "Start Fit Review",
        destination: input.routes.fitReview,
        kind: "navigate",
      });
    case "generation_failed":
    case "generation_timeout":
      return buildAction({
        type: "retry_generation",
        label: "Retry Generation",
        destination: input.routes.studio,
        kind: "invoke",
      });
    case "missing_or_mismatched_pair_state":
      return buildAction({
        type: "recover_selection",
        label: "Fix Pair Selection",
        destination: input.routes.target,
        kind: "navigate",
      });
    case "returning_user_persisted_last_assessment":
      return buildAction({
        type: "view_results",
        label: "Open Results",
        destination: input.routes.results,
        kind: "navigate",
      });
    case "results_unavailable":
      return buildAction({
        type: "view_results",
        label: "Go to Target",
        destination: input.routes.target,
        kind: "navigate",
      });
    case "invalid_navigation_state":
      return buildAction({
        type: "recover_selection",
        label: "Return to Baseline",
        destination: input.routes.baseline,
        kind: "navigate",
      });
  }
}

function resolveBlockingReason(
  input: WorkflowProgressionInput,
  state: WorkflowState,
  action: WorkflowPrimaryAction,
): WorkflowBlockingReason {
  switch (state) {
    case "first_run":
      return buildBlockingReason({
        code: "results_unavailable",
        message: "Upload a baseline resume to start a valid workflow.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "founder_excluded":
      return buildBlockingReason({
        code: "invalid_navigation_state",
        message: "Founder-excluded workflows need a standard baseline before continuing.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "no_baseline":
      return buildBlockingReason({
        code: "results_unavailable",
        message: "Upload a baseline resume before continuing.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "baseline_uploading":
      return buildBlockingReason({
        code: "invalid_navigation_state",
        message: "Your baseline is still uploading.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "baseline_ready_no_job":
      return buildBlockingReason({
        code: "no_job_description",
        message: "Your baseline is ready. Add a job description to continue.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "job_present_analysis_not_started":
      return buildBlockingReason({
        code: "results_unavailable",
        message: "You have a valid baseline and role. Run analysis next.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "analysis_in_progress":
      return buildBlockingReason({
        code: "analysis_in_progress",
        message: "Analysis is still running. You can return to Results or Baseline.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "results_ready_studio_blocked":
      return buildBlockingReason({
        code: "studio_blocked_for_evidence",
        message: "Studio is blocked until the role evidence is strong enough.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "studio_blocked_for_evidence":
      return buildBlockingReason({
        code: "studio_blocked_for_evidence",
        message: "Studio needs stronger grounding before generation can continue.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "generation_blocked":
      return buildBlockingReason({
        code: "generation_blocked",
        message: "Generation is blocked until the current gaps are resolved.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "generation_failed":
      return buildBlockingReason({
        code: "generation_failed",
        message: "Generation failed. Retry or return to Results.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "generation_timeout":
      return buildBlockingReason({
        code: "generation_timeout",
        message: "Generation is taking longer than expected.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "archived_baseline_selected":
      return buildBlockingReason({
        code: "archived_baseline_selected",
        message: "This baseline is archived. Choose an active resume.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "missing_or_mismatched_pair_state":
      return buildBlockingReason({
        code: "stale_pair_state",
        message: "The selected baseline and role do not match the saved assessment.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
    case "returning_user_persisted_last_assessment":
      return null;
    case "results_ready":
    case "results_unavailable":
      return null;
    case "invalid_navigation_state":
      return buildBlockingReason({
        code: "invalid_navigation_state",
        message: "This page no longer matches the current workflow state.",
        retryable: true,
        nextAction: action.label,
        destination: action.destination,
      });
  }
}

export function resolveWorkflowProgression(
  input: WorkflowProgressionInput,
): WorkflowProgressionContract {
  const pairKey = resolvePairKey(input.baselineId, input.jobId);
  const hasAssessment = Boolean(cleanLabel(input.analysisAssessmentId) || cleanLabel(input.persistedAssessmentId));
  const currentMatches =
    matchesPair(
      input.baselineId,
      input.jobId,
      input.analysisBaselineId,
      input.analysisJobId,
      input.analysisBaselineVersionId,
      input.baselineVersionId,
    ) ||
    matchesPair(
      input.baselineId,
      input.jobId,
      input.persistedAssessmentBaselineId,
      input.persistedAssessmentJobId,
      input.persistedAssessmentBaselineVersionId,
      input.baselineVersionId,
    );

  const stalePairState =
    Boolean(hasAssessment && input.baselineId && input.jobId && !currentMatches) ||
    Boolean(input.isStalePairState);

  let state: WorkflowState;

  if (input.isInvalidNavigationState) {
    state = "invalid_navigation_state";
  } else if (input.founderExcluded) {
    state = "founder_excluded";
  } else if (input.baselineStatus === "ARCHIVED") {
    state = "archived_baseline_selected";
  } else if (!input.baselineId) {
    state = input.firstRun ? "first_run" : "no_baseline";
  } else if (input.baselineStatus === "UPLOADING") {
    state = "baseline_uploading";
  } else if (!input.jobId) {
    state = "baseline_ready_no_job";
  } else if (stalePairState) {
    state = "missing_or_mismatched_pair_state";
  } else if (input.analysisStatus === "running") {
    state = "analysis_in_progress";
  } else if (input.analysisStatus === "failed") {
    state = "results_unavailable";
  } else if (!hasAssessment) {
    state = "job_present_analysis_not_started";
  } else if (input.generationStatus === "running") {
    state = "generation_running";
  } else if (input.generationStatus === "failed") {
    state = "generation_failed";
  } else if (input.generationStatus === "timeout") {
    state = "generation_timeout";
  } else if (input.generationReadiness?.blocked || input.isGenerationBlocked) {
    state =
      input.surface === "results" || input.surface === "studio"
        ? "studio_blocked_for_evidence"
        : "generation_blocked";
  } else if (
    input.productReadiness &&
    !input.productReadiness.canOpenStudio &&
    input.surface !== "baseline"
  ) {
    state = input.surface === "results" ? "results_ready_studio_blocked" : "generation_blocked";
  } else if (input.productReadiness?.canOpenStudio) {
    state = input.surface === "studio" ? "studio_ready" : "results_ready";
  } else if (input.hasJobDescription === false) {
    state = "baseline_ready_no_job";
  } else {
    state = hasAssessment ? "results_ready" : "results_unavailable";
  }

  const primaryAction = resolvePrimaryAction(input, state);
  const blockingReason = resolveBlockingReason(input, state, primaryAction);
  const supportingMessage = resolveSurfaceMessage(state);

  return {
    surface: input.surface,
    state,
    pairKey,
    primaryAction,
    blockingReason,
    nextAction: primaryAction.label,
    supportingMessage,
    dataSource: input.dataSource ?? "fresh",
    persistedAssessmentId: cleanLabel(input.persistedAssessmentId) || null,
  };
}
