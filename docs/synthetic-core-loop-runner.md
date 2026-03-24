# Synthetic Transaction Runner: core_loop_smoke

## Scenario implemented
`core_loop_smoke` is the first canonical API-level synthetic transaction runner.
It executes one deterministic core loop:
1. resolve/create dedicated synthetic user
2. resolve/create preserved synthetic baseline fixture
3. create synthetic job through `JobsService.createJob`
4. run fit assessment through `AnalysisService.runFitAssessment`
5. generate resume preview through `ResumeService.generateResume`
6. generate cover letter preview through `CoverLettersService.generateCoverLetter`
7. save opportunity through `OpportunitiesService.upsertOpportunity`

## Fixture strategy
- User: `synthetic-core-loop@targetthisrole.local`
- Baseline fixture: `core-loop-smoke-baseline.txt`
- Baseline fixture is marked `preserveFromCleanup=true`
- Job description is deterministic, code-embedded text for this scenario
- Per-run records use `preserveFromCleanup=false`

## Synthetic metadata propagation
Runner builds one synthetic run context (`scenarioKey`, `syntheticRunId`, timestamp) and passes metadata into canonical write paths.
Updated write paths:
- `UsersService.create`
- `AnalysisService.runFitAssessment`
- `ResumeService.generateResume` -> `ApplicationsService.upsertPreparedFromResumeGeneration` and `OpportunitiesService.createFromResumeStudio`
- `CoverLettersService.generateCoverLetter`
- `OpportunitiesService.upsertOpportunity`

## Admin endpoint usage
- `POST /admin/synthetic-transactions/core-loop-smoke/run`
- `GET /admin/synthetic-transactions/core-loop-smoke/runs?limit=20`
- `GET /admin/synthetic-transactions/core-loop-smoke/latest`

All endpoints are protected by existing admin auth/guard patterns.

## Logging
Synthetic transaction runs are stored in `synthetic_cleanup_runs` with:
- `runType='synthetic_transaction'`
- `scenarioKey='core_loop_smoke'`
- `stepResultsJson` with per-step status/details
- `summaryJson` and `errorMessage`

## What this does not cover yet
- No browser automation (Playwright) yet
- No recurring scheduler for synthetic transaction runs yet
- Only one canonical scenario is implemented in this pass

## Why this prepares post-deploy checks
This runner exercises real service-layer persistence and business logic with deterministic fixtures and cleanup-safe metadata, creating a stable backbone for future scheduled smoke checks and Playwright orchestration.
