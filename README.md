# TargetThisRole

TargetThisRole is a beta web product centered on one canonical loop:

Compatibility Check -> Fit Review -> Baseline Expansion Interview -> Resume/Cover Generation -> Application Tracker

## Monorepo Layout

- `apps/web`: Next.js web app
- `apps/api`: NestJS API
- `scripts`: repository utilities and guardrails
- `archive`: archived docs not part of the current beta source of truth

## Current Beta Notes

- Canonical interview flow uses the `interview-records` domain behind `/api/interviews/*`.
- The canonical tracking surface is `Application Tracker` (`/job-tracker`).
- Compliance blocking is enforced for beta-critical generation/export paths.

## Common Commands

From repo root:

- `npm run build:api`
- `npm run build:web`
- `npm run build:both`
- `npm run check:beta-scope`

