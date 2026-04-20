export type ResetTablePlan = {
  preserve: string[];
  clear: string[];
  manualReview: string[];
  unknownDiscovered: string[];
  notes: string[];
};

// IMPORTANT:
// - We do not invent table names. This is a curated map derived from TypeORM migrations/entities in this repo.
// - Unknown discovered tables are never cleared automatically; they are flagged for manual review.
// - If you add/remove tables in migrations, update this list intentionally.
export const KNOWN_TABLE_CLASSIFICATION = {
  // Identity/auth/admin continuity (preserve)
  preserve: [
    'users',
    'admin_users',
    'user_tokens',
    'access_codes',
    'beta_access_codes',
    'compliance_audits',
    'bug_reports',
  ],

  // Product/workflow state (clear)
  clear: [
    // Baselines + derived artifacts
    'baselines',
    'baseline_versions',
    'baseline_sections',
    'baseline_parsed',
    'baseline_block_policies',

    // Baseline/job workflow outputs
    'fit_assessments',
    'expanded_fit_assessments',
    'workflow_operation_runs',
    'studio_artifacts',
    'product_signal_snapshots',

    // Canonical loop workflow state / trackers / downstream records
    'jobs',
    'applications',
    'opportunities',
    'job_tracker_entries',
    'cover_letters',
    'reality_checks',
    'interviews',
    'interview_sessions',
    'interview_responses',
    'interview_accepted_additions',
    'star_stories',

    // Synthetic workflow state
    'synthetic_cleanup_runs',
  ],

  // Tables that may be support/analytics/admin-adjacent; preserve by default
  // and require explicit decision before clearing.
  manualReview: [
    'analytics_events',
    'beta_feedback',
    'feedback_items',
    'friction_events',
    'search_sets',
    'search_set_runs',
    'user_triggers',
  ],
} as const;

const INTERNAL_PRESERVE_ALWAYS = [
  // TypeORM / migration infra (do not touch)
  'migrations',
  'typeorm_metadata',
];

export function buildWorkflowResetPlan(discoveredTables: string[]): ResetTablePlan {
  const discovered = Array.from(new Set(discoveredTables)).sort();
  const preserve = new Set<string>([
    ...KNOWN_TABLE_CLASSIFICATION.preserve,
    ...INTERNAL_PRESERVE_ALWAYS,
    ...KNOWN_TABLE_CLASSIFICATION.manualReview,
  ]);
  const clear = new Set<string>(KNOWN_TABLE_CLASSIFICATION.clear);

  const knownAll = new Set<string>([
    ...KNOWN_TABLE_CLASSIFICATION.preserve,
    ...KNOWN_TABLE_CLASSIFICATION.clear,
    ...KNOWN_TABLE_CLASSIFICATION.manualReview,
    ...INTERNAL_PRESERVE_ALWAYS,
  ]);

  const unknownDiscovered = discovered.filter((t) => !knownAll.has(t));

  const plan: ResetTablePlan = {
    preserve: discovered.filter((t) => preserve.has(t)),
    clear: discovered.filter((t) => clear.has(t)),
    manualReview: discovered.filter((t) => KNOWN_TABLE_CLASSIFICATION.manualReview.includes(t as never)),
    unknownDiscovered,
    notes: [],
  };

  if (unknownDiscovered.length > 0) {
    plan.notes.push(
      `Unknown tables discovered in DB (preserved; manual review required): ${unknownDiscovered.join(
        ', ',
      )}`,
    );
  }

  // Sanity: avoid accidental overlap
  const overlap = plan.clear.filter((t) => preserve.has(t));
  if (overlap.length > 0) {
    plan.notes.push(`Classification overlap detected (will preserve, not clear): ${overlap.join(', ')}`);
    plan.clear = plan.clear.filter((t) => !overlap.includes(t));
  }

  return plan;
}

