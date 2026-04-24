export const ANALYTICS_EVENT_NAMES = [
  'landing_viewed',
  'landing_score_requested',
  'landing_score_revealed',
  'landing_unlock_clicked',
  'landing_auth_started',
  'landing_cta_click',
  'landing_cta_footer_click',
  'resume_upload_initiated',
  'resume_upload_completed',
  'job_description_focused',
  'compatibility_analysis_started',
  'compatibility_analysis_completed',
  'role_analysis_started',
  'role_analysis_completed',
  'opportunity_saved',
  'opportunity_commit_intent',
  'resume_studio_opened',
  'unlock_flow_entered',
  'unlock_flow_completed',
  'unlock_flow_skipped',
  'unlock_reanalysis_succeeded',
  'unlock_reanalysis_failed',
  'unlock_outcome_viewed',
  'unlock_generation_started',
  'generation_ready_shell_viewed',
  'generation_ready_shell_started',
  'generation_ready_shell_failed',
  'generation_ready_shell_dismissed',
  'target_momentum_entry_viewed',
  'target_job_input_focused',
  'target_job_pasted',
  'target_score_started_from_momentum',
  'target_auto_score_started',
  'target_generation_blocked',
  'baseline_readiness_viewed',
  'target_generation_state_viewed',
  'target_cta_clicked',
  'target_generation_blocked_redirect',
  'results_improvement_module_viewed',
  'results_improvement_cta_clicked',
  'results_radar_viewed',
  'results_radar_axis_hovered',
  'results_primary_cta_clicked',
  'results_completed',
  'auto_routed_to_studio',
  'artifact_viewed_with_confidence_level',
  'improve_output_panel_viewed',
  'critique_panel_viewed',
  'critique_recommendation_clicked',
  'critique_issue_resolved',
  'critique_recomputed',
  'critique_stopping_state_reached',
  'final_role_check_viewed',
  'final_role_adjustment_clicked',
  'final_role_check_passed',
  'final_role_check_ignored_then_exported',
  'final_role_check_followed_by_export',
  'calibration_feedback_generated',
  'feedback_applied',
  'feedback_regeneration_triggered',
  'quality_improved_after_feedback',
  'claim_verify_clicked',
  'claim_edit_clicked',
  'claim_dismissed',
  'artifact_regenerated',
  'confidence_upgraded',
  'studio_generated_artifact_viewed',
  'studio_generation_state_viewed',
  'studio_generate_blocked',
  'studio_generate_limited',
  'studio_application_ready_viewed',
  'studio_application_completed_viewed',
  'application_progress_viewed',
  'application_created_or_upserted',
  'application_status_updated',
  'refinement_started',
  'refinement_type_used',
  'refinement_undone',
  'refinement_applied',
  'refinement_followed_by_export',
  'artifact_used_intent',
  'artifact_refine_intent',
  'resume_generation_attempted',
  'resume_generation_succeeded',
  'resume_generation_limited',
  'resume_generation_blocked_compliance',
  'cover_letter_generation_attempted',
  'cover_letter_generation_succeeded',
  'cover_letter_generation_limited',
  'cover_letter_generation_blocked_compliance',
  'studio_auto_generation_started',
  'studio_auto_generation_succeeded',
  'studio_auto_generation_failed',
  'studio_retry_clicked',
  'studio_apply_clicked',
  'studio_next_role_clicked',
  'studio_resume_downloaded',
  'studio_resume_copied',
  'studio_cover_letter_downloaded',
  'studio_cover_letter_copied',
  'analysis_load_failed',
  'scoring_interrupted_due_to_input_change',
  'scoring_auto_retried',
  'scoring_manual_rerun_after_interruption',
  'scoring_hard_failure',
  'scroll_depth_reached',
  'workflow_surface_authority_viewed',
  'artifact_state_normalized_viewed',
  'artifact_retry_started',
  'artifact_retry_failed',
  'stale_artifact_suppressed',
  'low_confidence_artifact_viewed',
  'workflow_activity_started',
  'workflow_activity_completed',
  'workflow_contract_violation_detected',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export const ANALYTICS_SCORE_BUCKETS = [
  'under_60',
  '60s',
  '70s',
  '80s',
  '90_plus',
] as const;

export type AnalyticsScoreBucket = (typeof ANALYTICS_SCORE_BUCKETS)[number];

export const ANALYTICS_SCROLL_DEPTHS = [25, 50, 75, 100] as const;

export type AnalyticsScrollDepth = (typeof ANALYTICS_SCROLL_DEPTHS)[number];

export function resolveScoreBucket(
  scoreInput: number,
): AnalyticsScoreBucket {
  const score = Number(scoreInput);
  if (!Number.isFinite(score)) {
    return 'under_60';
  }
  if (score >= 90) {
    return '90_plus';
  }
  if (score >= 80) {
    return '80s';
  }
  if (score >= 70) {
    return '70s';
  }
  if (score >= 60) {
    return '60s';
  }
  return 'under_60';
}
