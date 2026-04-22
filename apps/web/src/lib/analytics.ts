"use client";

import type { RecentIntentState } from "@/src/lib/recentIntent";
import type { ScoreBand } from "@/src/lib/score-band";

export const ANALYTICS_EVENT_NAMES = [
  "landing_viewed",
  "landing_score_requested",
  "landing_score_revealed",
  "landing_unlock_clicked",
  "landing_auth_started",
  "landing_cta_click",
  "landing_cta_footer_click",
  "resume_upload_initiated",
  "resume_upload_completed",
  "job_description_focused",
  "compatibility_analysis_started",
  "compatibility_analysis_completed",
  "role_analysis_started",
  "role_analysis_completed",
  "opportunity_saved",
  "resume_studio_opened",
  "resume_generation_attempted",
  "resume_generation_succeeded",
  "resume_generation_limited",
  "resume_generation_blocked_compliance",
  "studio_auto_generation_started",
  "studio_auto_generation_succeeded",
  "studio_auto_generation_failed",
  "studio_generated_artifact_viewed",
  "studio_retry_clicked",
  "studio_resume_downloaded",
  "studio_cover_letter_downloaded",
  "studio_resume_copied",
  "studio_cover_letter_copied",
  "studio_application_ready_viewed",
  "studio_application_completed_viewed",
  "studio_apply_clicked",
  "studio_next_role_clicked",
  "application_progress_viewed",
  "application_status_updated",
  "application_created_or_upserted",
  "target_momentum_entry_viewed",
  "target_job_input_focused",
  "target_job_pasted",
  "target_score_started_from_momentum",
  "target_auto_score_started",
  "artifact_used_intent",
  "artifact_refine_intent",
  "refinement_started",
  "refinement_type_used",
  "refinement_applied",
  "refinement_undone",
  "refinement_followed_by_export",
  "opportunity_commit_intent",
  "cover_letter_generation_attempted",
  "cover_letter_generation_succeeded",
  "cover_letter_generation_limited",
  "cover_letter_generation_blocked_compliance",
  "analysis_load_failed",
  "scoring_interrupted_due_to_input_change",
  "scoring_auto_retried",
  "scoring_manual_rerun_after_interruption",
  "scoring_hard_failure",
  "scroll_depth_reached",
  "target_generation_blocked",
  "baseline_readiness_viewed",
  "studio_generation_state_viewed",
  "studio_generate_blocked",
  "studio_generate_limited",
  "target_generation_state_viewed",
  "target_cta_clicked",
  "target_generation_blocked_redirect",
  "results_improvement_module_viewed",
  "results_improvement_cta_clicked",
  "results_radar_viewed",
  "results_radar_axis_hovered",
  "results_primary_cta_clicked",
  "results_completed",
  "auto_routed_to_studio",
  "artifact_viewed_with_confidence_level",
  "improve_output_panel_viewed",
  "critique_panel_viewed",
  "critique_recommendation_clicked",
  "critique_issue_resolved",
  "critique_recomputed",
  "critique_stopping_state_reached",
  "final_role_check_viewed",
  "final_role_adjustment_clicked",
  "final_role_check_passed",
  "final_role_check_ignored_then_exported",
  "final_role_check_followed_by_export",
  "calibration_feedback_generated",
  "feedback_applied",
  "feedback_regeneration_triggered",
  "quality_improved_after_feedback",
  "claim_verify_clicked",
  "claim_edit_clicked",
  "claim_dismissed",
  "artifact_regenerated",
  "confidence_upgraded",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export type ScoreBucket = "under_60" | "60s" | "70s" | "80s" | "90_plus";
export type ScrollDepth = 25 | 50 | 75 | 100;
export type ResultsPrimaryCtaReadinessStatus = "ready" | "limited" | "blocked";

// Product/UI generation states (score-driven).
// - 70–79: DRAFT
// - 80+: READY (system-owned finalized)
// Readiness/trust signals can affect confidence/messaging but must not remove DRAFT from analytics.
export type GenerationAnalyticsState = "READY" | "DRAFT" | "LIMITED" | "BLOCKED";

export type AnalyticsEventMap = {
  landing_viewed: {
    referrer: string | null;
    deviceType: "mobile" | "tablet" | "desktop";
  };
  landing_score_requested: {
    source: "landing";
    hasResume: boolean;
    jobDescriptionLength: number;
  };
  landing_score_revealed: {
    source: "landing";
    score: number;
    scoreBand: "TOP" | "MID" | "LOW";
    tension_variant?: "v1";
  };
  landing_unlock_clicked: {
    source: "landing";
    destination: "/auth/signup" | "/auth/login" | "/baseline";
    authenticated: boolean;
    tension_variant?: "v1";
  };
  landing_auth_started: {
    source: "landing";
    destination: "/auth/signup" | "/auth/login";
  };
  landing_cta_click: {
    destination: "/auth/signup" | "/baseline";
    authenticated: boolean;
  };
  landing_cta_footer_click: {
    destination: "/auth/signup" | "/baseline";
    authenticated: boolean;
  };
  resume_upload_initiated: {
    source: "landing";
  };
  resume_upload_completed: {
    source: "landing";
    fileType: string;
  };
  job_description_focused: {
    source: "landing";
  };
  compatibility_analysis_started: {
    source: "landing" | "app" | "unknown";
    jobDescriptionLength: number;
    hasResume: boolean;
    analysisNumber: number;
  };
  compatibility_analysis_completed: {
    source: "landing";
    score: number;
    scoreBucket: ScoreBucket;
  };
  role_analysis_started: {
    source: "landing" | "app" | "unknown";
    roleInputLength: number;
  };
  role_analysis_completed: {
    source: "results" | "unknown";
    score?: number;
    scoreBucket?: ScoreBucket;
    jobId?: string;
    baselineId?: string;
  };
  opportunity_saved: {
    source: "results" | "workspace" | "unknown";
    score?: number;
    scoreBucket?: ScoreBucket;
    jobId?: string;
    baselineId?: string;
  };
  resume_studio_opened: {
    entrySource: "results" | "nav" | "direct" | "unknown";
    baselineId?: string;
  };
  resume_generation_attempted: {
    source: "studio" | "unknown";
    analysisId?: string;
  };
  resume_generation_succeeded: {
    source: "studio" | "unknown";
    analysisId?: string;
  };
  resume_generation_limited: {
    source: "studio" | "unknown";
    analysisId?: string;
    reasonCode?: string;
  };
  resume_generation_blocked_compliance: {
    source: "studio" | "unknown";
    analysisId?: string;
    reasonCode?: string;
  };
  studio_auto_generation_started: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
    generationTarget: "resume_and_cover_letter";
  };
  studio_auto_generation_succeeded: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
    generationTarget: "resume_and_cover_letter";
  };
  studio_auto_generation_failed: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
    generationTarget: "resume_and_cover_letter";
    reason: string;
  };
  studio_generated_artifact_viewed: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
    artifactType: "resume" | "cover_letter";
    presentationState: "generated" | "hydrated";
  };
  studio_retry_clicked: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
    artifactType: "resume" | "cover_letter" | "pair";
    failureCategory?: string | null;
  };
  studio_resume_downloaded: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
    format: "docx" | "pdf";
  };
  studio_cover_letter_downloaded: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
    format: "docx" | "pdf";
  };
  studio_resume_copied: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
  };
  studio_cover_letter_copied: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
  };
  studio_application_ready_viewed: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
    currentStatus: string | null;
    totalApplicationsCount?: number | null;
  };
  studio_application_completed_viewed: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
    currentStatus: string | null;
    totalApplicationsCount?: number | null;
  };
  studio_apply_clicked: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
    currentStatus: string | null;
  };
  studio_next_role_clicked: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
    currentStatus: string | null;
    totalApplicationsCount?: number | null;
  };
  application_progress_viewed: {
    source: "studio";
    analysisId: string | null;
    baselineId: string | null;
    jobId: string | null;
    score: number | null;
    totalApplicationsCount: number | null;
    completedApplicationsCount: number | null;
    recentActivityCount: number | null;
  };
  application_status_updated: {
    source: "studio" | "app" | "unknown";
    baselineId: string | null;
    jobId: string | null;
    currentStatus: string;
    previousStatus?: string | null;
    score: number | null;
  };
  application_created_or_upserted: {
    source: "studio" | "app" | "unknown";
    baselineId: string | null;
    jobId: string | null;
    currentStatus: string;
    created: boolean;
    score: number | null;
  };
  target_momentum_entry_viewed: {
    source: "studio_post_apply" | "generic";
    baselineId: string | null;
    jobId: string | null;
  };
  target_job_input_focused: {
    source: "studio_post_apply" | "generic";
    baselineId: string | null;
    jobId: string | null;
  };
  target_job_pasted: {
    source: "studio_post_apply" | "generic";
    baselineId: string | null;
    jobId: string | null;
    pastedLength: number;
  };
  target_score_started_from_momentum: {
    source: "studio_post_apply";
    baselineId: string | null;
    jobId: string | null;
    inputLength: number;
  };
  target_auto_score_started: {
    source: "studio_post_apply";
    baselineId: string | null;
    jobId: string | null;
  };
  artifact_used_intent: {
    source: "studio" | "unknown";
    artifactType: "resume" | "cover_letter";
    action: "export" | "use_now";
    format?: "docx" | "pdf";
    status?: string;
  };
  artifact_refine_intent: {
    source: "studio" | "unknown";
    analysisId?: string;
    reason?: string;
  };
  refinement_started: {
    source: "studio" | "unknown";
    baselineId: string | null;
    jobId: string | null;
    refinementType: string;
    refinementTarget: "resume" | "cover_letter" | "both";
    refinementCount: number;
  };
  refinement_type_used: {
    source: "studio" | "unknown";
    baselineId: string | null;
    jobId: string | null;
    refinementType: string;
    refinementTarget: "resume" | "cover_letter" | "both";
  };
  refinement_applied: {
    source: "studio" | "unknown";
    baselineId: string | null;
    jobId: string | null;
    refinementAction: "apply" | "undo" | "reset";
    refinementType: string;
    refinementTarget: "resume" | "cover_letter" | "both";
    refinementCount: number;
  };
  refinement_undone: {
    source: "studio" | "unknown";
    baselineId: string | null;
    jobId: string | null;
    refinementType: string;
    refinementTarget: "resume" | "cover_letter" | "both";
    refinementCount: number;
  };
  refinement_followed_by_export: {
    source: "studio" | "unknown";
    baselineId: string | null;
    jobId: string | null;
    artifactType: "resume" | "cover_letter";
    refinementCount: number;
  };
  calibration_feedback_generated: {
    source: "studio" | "unknown";
    scenarioName?: string;
    overallCalibration: "aligned" | "close" | "off_target";
    gapCount: number;
    adjustmentCount: number;
  };
  feedback_applied: {
    source: "studio" | "unknown";
    scenarioName?: string;
    adjustmentCount: number;
    targetSubsystems: Array<
      "strategy_plan" | "quality_pass" | "refinement_bias" | "language_style"
    >;
  };
  feedback_regeneration_triggered: {
    source: "studio" | "unknown";
    scenarioName?: string;
    passCount: number;
  };
  quality_improved_after_feedback: {
    source: "studio" | "unknown";
    scenarioName?: string;
    beforeOverallCalibration: "aligned" | "close" | "off_target";
    afterOverallCalibration: "aligned" | "close" | "off_target";
    improvedDimensionCount: number;
  };
  opportunity_commit_intent: {
    source: "studio" | "unknown";
    analysisId?: string;
    hasTrackerEntry?: boolean;
    action: "save" | "continue";
  };
  cover_letter_generation_attempted: {
    source: "studio" | "unknown";
    analysisId?: string;
  };
  cover_letter_generation_succeeded: {
    source: "studio" | "unknown";
    analysisId?: string;
  };
  cover_letter_generation_limited: {
    source: "studio" | "unknown";
    analysisId?: string;
    reasonCode?: string;
  };
  cover_letter_generation_blocked_compliance: {
    source: "studio" | "unknown";
    analysisId?: string;
    reasonCode?: string;
  };
  analysis_load_failed: {
    source: "results" | "unknown";
    status?: string;
  };
  scoring_interrupted_due_to_input_change: {
    source: "target" | "unknown";
    baselineId: string | null;
    jobId: string | null;
    previousBaselineId: string | null;
    previousJobId: string | null;
    requestId: string;
  };
  scoring_auto_retried: {
    source: "target" | "unknown";
    baselineId: string | null;
    jobId: string | null;
    previousBaselineId: string | null;
    previousJobId: string | null;
    requestId: string;
  };
  scoring_manual_rerun_after_interruption: {
    source: "target" | "unknown";
    baselineId: string | null;
    jobId: string | null;
    requestId: string;
  };
  scoring_hard_failure: {
    source: "target" | "unknown";
    baselineId: string | null;
    jobId: string | null;
    requestId: string;
    message: string;
  };
  scroll_depth_reached: {
    depthPercent: ScrollDepth;
  };
  target_generation_blocked: {
    score: number;
    blockers: string[];
  };
  baseline_readiness_viewed: {
    source: "baseline";
    baselineId: string | null;
    readinessState: "NOT_ANALYZED" | "ANALYZING" | "READY";
    latestAssessmentId: string | null;
    latestFitScore: number | null;
    dataSource: "fresh" | "persisted" | "mixed";
  };
  studio_generation_state_viewed: {
    state: GenerationAnalyticsState;
    score: number | null;
    blockerCount: number;
  };
  studio_generate_blocked: {
    score: number | null;
    blockerCodes: string[];
    documentType: "resume" | "cover_letter" | "application";
  };
  studio_generate_limited: {
    score: number | null;
    blockerCodes: string[];
    documentType: "resume" | "cover_letter" | "application";
  };
  target_generation_state_viewed: {
    state: GenerationAnalyticsState;
    score: number;
    baselineId: string;
    jobId: string;
  };
  target_cta_clicked: {
    state: GenerationAnalyticsState;
    score: number | null;
    label: string;
    href: string;
    actionType: "open_studio_generate" | "open_studio_limited" | "blocked_redirect" | "resolve_gaps";
  };
  target_generation_blocked_redirect: {
    score: number | null;
    blockerCodes: string[];
  };
  results_improvement_module_viewed: {
    source: string;
    intentState: string | null;
    suggestionsShown: number;
    scoreBucket: string | null;
  };
  results_improvement_cta_clicked: {
    source: string;
    intentState: string | null;
    suggestionsShown: number;
    scoreBucket: string | null;
  };
  results_radar_viewed: {
    source: "results";
    analysisId: string | null;
    score: number | null;
    scoreBucket: ScoreBucket | null;
    axisCount: number;
  };
  results_radar_axis_hovered: {
    source: "results";
    analysisId: string | null;
    axisKey: string;
    axisLabel: string;
    value: number;
    scoreBucket: ScoreBucket | null;
  };
  results_primary_cta_clicked: {
    source: "results";
    intentState: RecentIntentState | "none";
    action: "fit_review" | "verify_examples" | "open_studio_draft" | "open_studio";
    scoreBucket: ScoreBand | null;
    readinessStatus: ResultsPrimaryCtaReadinessStatus;
    accessMode: "momentum" | "recovery";
  };
  results_completed: {
    source: "results";
    score: number | null;
    baselineId: string | null;
    jobId: string | null;
    autoRouted: boolean;
  };
  auto_routed_to_studio: {
    source: "results";
    score: number | null;
    href: string;
  };
  artifact_viewed_with_confidence_level: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    artifactType: "resume" | "cover_letter";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    artifactScore: number;
    missingEvidenceCount: number;
  };
  improve_output_panel_viewed: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    initialConfidence: "HIGH" | "MEDIUM" | "LOW";
    finalConfidence: "HIGH" | "MEDIUM" | "LOW";
    artifactScore: number;
    improvableClaimCount: number;
  };
  critique_panel_viewed: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    overallAssessment: "strong" | "mixed" | "weak";
    issueCount: number;
    hasRecommendedAction: boolean;
  };
  critique_recommendation_clicked: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    issueType: string;
    severity: "high" | "medium" | "low";
    refinementType: string;
    refinementTarget: "resume" | "cover_letter" | "both";
    placement: "best_next" | "issue";
  };
  critique_issue_resolved: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    issueType: string;
    severity: "high" | "medium" | "low";
  };
  critique_recomputed: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    overallAssessment: "strong" | "mixed" | "weak";
    issueCount: number;
    changedIssueTypes: string[];
  };
  critique_stopping_state_reached: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    overallAssessment: "strong" | "mixed" | "weak";
    issueCount: number;
  };
  final_role_check_viewed: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    overallMatchReadiness: "ready" | "needs_tightening" | "misaligned";
    priorityCoverageCount: number;
    recruiterScanRiskCount: number;
    hasRecommendedAdjustments: boolean;
  };
  final_role_adjustment_clicked: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    adjustmentType: "summary_tighten" | "bullet_reorder" | "keyword_tighten" | "cover_letter_role_focus";
    adjustmentTarget: "resume" | "cover_letter" | "both";
  };
  final_role_check_passed: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    overallMatchReadiness: "ready" | "needs_tightening" | "misaligned";
    priorityCoverageCount: number;
  };
  final_role_check_ignored_then_exported: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    artifactType: "resume" | "cover_letter";
    adjustmentCount: number;
    overallMatchReadiness: "ready" | "needs_tightening" | "misaligned";
    priorityCoverageCount: number;
    recruiterScanRiskCount: number;
  };
  final_role_check_followed_by_export: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    artifactType: "resume" | "cover_letter";
    adjustmentCount: number;
    overallMatchReadiness: "ready" | "needs_tightening" | "misaligned";
    priorityCoverageCount: number;
    recruiterScanRiskCount: number;
  };
  claim_verify_clicked: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    claimText: string;
    artifactType: "resume" | "cover_letter";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    artifactScore: number;
  };
  claim_edit_clicked: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    claimText: string;
    artifactType: "resume" | "cover_letter";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    artifactScore: number;
  };
  claim_dismissed: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    claimText: string;
    artifactType: "resume" | "cover_letter";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    artifactScore: number;
  };
  artifact_regenerated: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    initialConfidence: "HIGH" | "MEDIUM" | "LOW";
    finalConfidence: "HIGH" | "MEDIUM" | "LOW";
    artifactScoreDelta: number;
  };
  confidence_upgraded: {
    source: "studio";
    baselineId: string | null;
    jobId: string | null;
    initialConfidence: "HIGH" | "MEDIUM" | "LOW";
    finalConfidence: "HIGH" | "MEDIUM" | "LOW";
    artifactScoreDelta: number;
  };
};

type TrackEventInput<TName extends AnalyticsEventName> = {
  eventName: TName;
  properties: AnalyticsEventMap[TName];
  path?: string | null;
  userId?: string | null;
};

const ANALYTICS_SESSION_KEY = "ttr-analytics-session-id";
const USER_ID_ENDPOINT = "/api/users/me";
const AUTH_BOOTSTRAP_DIAGNOSTIC_EVENT = "ttr:auth-bootstrap";

let cachedUserId: string | null = null;
let userIdLookupInFlight: Promise<string | null> | null = null;

type AuthBootstrapDiagnosticStage = "attempted" | "succeeded" | "failed";

function emitAuthBootstrapDiagnostic(
  stage: AuthBootstrapDiagnosticStage,
  detail?: Record<string, unknown>,
) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.dispatchEvent(
      new CustomEvent(AUTH_BOOTSTRAP_DIAGNOSTIC_EVENT, {
        detail: { stage, ...(detail ?? {}) },
      }),
    );
  } catch {
    // no-op
  }
}

function safeStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // no-op
  }
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateAnalyticsSessionId(): string {
  if (typeof window === "undefined") {
    return "server-render";
  }
  const existing = safeStorageGet(ANALYTICS_SESSION_KEY);
  if (existing) {
    return existing;
  }
  const next = createSessionId();
  safeStorageSet(ANALYTICS_SESSION_KEY, next);
  return next;
}

export function resolveScoreBucket(score: number): ScoreBucket {
  if (score >= 90) return "90_plus";
  if (score >= 80) return "80s";
  if (score >= 70) return "70s";
  if (score >= 60) return "60s";
  return "under_60";
}

export function detectDeviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") {
    return "desktop";
  }
  const width = window.innerWidth;
  if (width < 768) {
    return "mobile";
  }
  if (width < 1024) {
    return "tablet";
  }
  return "desktop";
}

function pathFromWindow(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return `${window.location.pathname}${window.location.search}`;
}

function parseUserId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  return id || null;
}

async function getUserIdBestEffort(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }
  if (cachedUserId) {
    return cachedUserId;
  }
  if (userIdLookupInFlight) {
    return userIdLookupInFlight;
  }

  userIdLookupInFlight = (async () => {
    try {
      emitAuthBootstrapDiagnostic("attempted", { endpoint: USER_ID_ENDPOINT });
      const response = await fetch(USER_ID_ENDPOINT, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        emitAuthBootstrapDiagnostic("failed", {
          endpoint: USER_ID_ENDPOINT,
          status: response.status,
        });
        return null;
      }
      const payload = await response.json().catch(() => null);
      const userId = parseUserId(payload);
      if (userId) {
        cachedUserId = userId;
      }
      emitAuthBootstrapDiagnostic("succeeded", { endpoint: USER_ID_ENDPOINT });
      return userId;
    } catch {
      emitAuthBootstrapDiagnostic("failed", {
        endpoint: USER_ID_ENDPOINT,
        status: "network_error",
      });
      return null;
    } finally {
      userIdLookupInFlight = null;
    }
  })();

  return userIdLookupInFlight;
}

export function trackEvent<TName extends AnalyticsEventName>(
  eventName: TName,
  properties: AnalyticsEventMap[TName],
  options?: { path?: string | null; userId?: string | null; allowUserLookup?: boolean },
): void {
  if (typeof window === "undefined") {
    return;
  }

  const sessionId = getOrCreateAnalyticsSessionId();
  const createdAt = new Date().toISOString();
  const path = options?.path ?? pathFromWindow();
  const allowUserLookup = options?.allowUserLookup !== false;

  void (async () => {
    const resolvedUserId =
      allowUserLookup && options?.userId === undefined
        ? await getUserIdBestEffort()
        : (options?.userId ?? null);
    const payload: TrackEventInput<TName> & {
      sessionId: string;
      createdAt: string;
    } = {
      eventName,
      sessionId,
      userId: resolvedUserId ?? null,
      path,
      createdAt,
      properties,
    };

    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Fire-and-forget: analytics must never break UX.
    });
  })();
}
