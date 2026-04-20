# Workflow State Reset (One-Time, Production Guarded)

Business intent: treat all historical workflow/product state as incompatible with the new canonical loop, while **preserving identity/admin continuity**.

## Preserved (not modified)

- `users` (login/auth continuity)
- `admin_users` (admin continuity)
- `user_tokens` (email confirmation/session token table)
- `access_codes`, `beta_access_codes` (beta allowlist/approval continuity)
- `bug_reports` (support history)
- `compliance_audits` (compliance/admin audit trail)
- TypeORM infra tables (`migrations`, `typeorm_metadata`) if present

## Cleared (workflow/product state)

All of these are truncated with `TRUNCATE ... RESTART IDENTITY CASCADE`:

- Baselines + derived: `baselines`, `baseline_versions`, `baseline_sections`, `baseline_parsed`, `baseline_block_policies`
- Analysis outputs: `fit_assessments`, `expanded_fit_assessments`
- Idempotency/workflow ops: `workflow_operation_runs`
- Artifacts/snapshots: `studio_artifacts`, `product_signal_snapshots`
- Canonical loop workflow records: `jobs`, `applications`, `opportunities`, `job_tracker_entries`, `cover_letters`, `reality_checks`
- Interviews: `interviews`, `interview_sessions`, `interview_responses`, `interview_accepted_additions`, `star_stories`
- Synthetic workflow: `synthetic_cleanup_runs`

## Manual review required (preserved by default)

These are **not** cleared automatically. They will show up in dry-run output as “manual review required”:

- `analytics_events`
- `beta_feedback`
- `feedback_items`, `friction_events`
- `search_sets`, `search_set_runs`
- `user_triggers`
- Any other unknown tables discovered in the `public` schema

## Guardrails (required)

The script refuses to run unless all are set:

- `ENABLE_WORKFLOW_RESET=true`
- `WORKFLOW_RESET_CONFIRM=RESET_WORKFLOW_STATE`
- `DATABASE_URL=postgresql://...` (must include host + database name)

It also prints the target `host` and `db` before doing anything, and refuses to proceed if `TRUNCATE ... CASCADE` would spill into non-cleared tables.

## Commands

From `apps/api`:

- Dry run:
  - `npm run workflow-reset:dry`
- Execute:
  - `npm run workflow-reset:exec`

## Rollback expectation

Rollback is **restore from DB backup only** (this is a destructive reset boundary).

