export type ConfidenceReasonLabel =
  | 'missing_job_text'
  | 'missing_baseline_text'
  | 'low_baseline_coverage'
  | 'low_job_coverage'
  | 'low_tooling_coverage'
  | 'low_domain_overlap'
  | 'strategy_floor_applied'
  | 'baseline_text_insufficient'
  | 'baseline_text_low'
  | 'baseline_text_moderate'
  | 'baseline_coverage_very_low'
  | 'baseline_coverage_low'
  | 'large_seniority_gap'
  | 'low_responsibility_overlap'
  | 'moderate_responsibility_overlap'
  | 'no_vectors';

export const confidenceReasonCopy: Record<ConfidenceReasonLabel, string> = {
  missing_job_text: 'Job text missing',
  missing_baseline_text: 'Baseline text missing',
  low_baseline_coverage: 'Low baseline coverage',
  low_job_coverage: 'Low job coverage',
  low_tooling_coverage: 'Low tooling coverage',
  low_domain_overlap: 'Low domain overlap',
  strategy_floor_applied: 'Strategy floor adjustment applied',
  baseline_text_insufficient:
    'Baseline text too short for reliable scoring.',
  baseline_text_low: 'Baseline text is slimmer than ideal.',
  baseline_text_moderate: 'Baseline text is moderate; more detail helps.',
  baseline_coverage_very_low:
    'Too little of the baseline was included in scoring.',
  baseline_coverage_low: 'Not enough of the baseline was used in scoring.',
  large_seniority_gap: 'Role seniority is far from the baseline.',
  low_responsibility_overlap:
    'Responsibility overlap with the job is weak.',
  moderate_responsibility_overlap:
    'Responsibility overlap is moderate.',
  no_vectors: 'Vector signals are unavailable.',
};

export function humanizeConfidenceReason(reason: string): string {
  return confidenceReasonCopy[reason as ConfidenceReasonLabel] ?? reason;
}
