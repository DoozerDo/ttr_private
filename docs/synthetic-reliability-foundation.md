# Synthetic Reliability Foundation (Beta)

## What synthetic tagging means in TTR
Synthetic rows represent data produced by automated synthetic transactions or reliability probes. Synthetic records are tagged with:
- `isSynthetic`
- `syntheticScenarioKey`
- `syntheticRunId`
- `syntheticCreatedAt`
- `preserveFromCleanup`

`preserveFromCleanup=true` marks fixtures that cleanup must never delete.

## Covered entities
- `users`
- `baselines`
- `fit_assessments`
- `expanded_fit_assessments`
- `interviews`
- `opportunities`
- `applications`
- `cover_letters`
- `job_tracker_entries`
- `beta_feedback`
- `analytics_events` (synthetic marker for analytics exclusion)

## Retention defaults
- Synthetic transactional records: `72h`
- Failed/partial synthetic records: `24h`
- Synthetic cleanup run logs: `7d`

## Environment variables
- `SYNTHETIC_TESTING_ENABLED`
- `SYNTHETIC_CLEANUP_ENABLED`
- `SYNTHETIC_RETENTION_HOURS`
- `SYNTHETIC_FAILED_RETENTION_HOURS`
- `SYNTHETIC_LOG_RETENTION_DAYS`
- `SYNTHETIC_CLEANUP_CRON`
- `SYNTHETIC_DRY_RUN_DEFAULT`

## Manual dry run cleanup
Call admin endpoint:
- `POST /admin/synthetic-cleanup/run`
- Body: `{ "dryRun": true, "scenarioKey": "beta-smoke", "syntheticRunId": "run-123" }`

Inspect:
- `GET /admin/synthetic-cleanup/config`
- `GET /admin/synthetic-cleanup/runs`
- `GET /admin/synthetic-cleanup/summary`

## Analytics and admin metrics exclusion
Synthetic analytics events (`analytics_events.is_synthetic = true`) are excluded by default in analytics summary/metrics and beta command center. Funnel and engagement metrics exclude synthetic users and synthetic journey records by default.

## Metadata to pass from future synthetic transaction jobs
Synthetic jobs should send:
- stable `syntheticScenarioKey` (e.g. `beta_baseline_full_flow`)
- unique `syntheticRunId` per run
- `isSynthetic=true`
- `syntheticCreatedAt` at creation time
- `preserveFromCleanup=true` only for durable fixtures intended to survive cleanup
