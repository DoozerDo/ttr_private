export const ANALYTICS_EVENT_NAMES = [
  'landing_viewed',
  'resume_upload_initiated',
  'resume_upload_completed',
  'job_description_focused',
  'compatibility_analysis_started',
  'compatibility_analysis_completed',
  'role_analysis_started',
  'role_analysis_completed',
  'opportunity_saved',
  'resume_studio_opened',
  'resume_generation_attempted',
  'resume_generation_succeeded',
  'resume_generation_limited',
  'resume_generation_blocked_compliance',
  'cover_letter_generation_attempted',
  'cover_letter_generation_succeeded',
  'cover_letter_generation_limited',
  'cover_letter_generation_blocked_compliance',
  'analysis_load_failed',
  'scroll_depth_reached',
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
