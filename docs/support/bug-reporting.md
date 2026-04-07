# Bug reporting

This repository now ships a zero-cost, in-app `Report a bug` flow that opens from the authenticated shell (header + footer) and enriches each submission before creating a GitHub issue.

## Flow overview

- Authenticated users click **Report a bug**, which launches a modal with the required repro steps, optional `trying to do`, `expected`, `email`, and screenshot fields.
- The modal captures the current route, page URL, browser user agent, and any stored analysis/baseline/job context.
- A POST to `/api/support/report-bug` validates the payload, rate limits per user, records a Sentry message (if configured), and posts a structured GitHub issue that includes the Sentry event id and runtime metadata.
.backend adds reproducibility hints, suggested area guidance, and severity estimates before posting to GitHub.

## Environment variables

| Name | Description |
| --- | --- |
| `GITHUB_BUG_REPORT_OWNER` | GitHub organization or user owning the repo that receives bug reports. |
| `GITHUB_BUG_REPORT_REPO` | Repository name that hosts the issues. |
| `GITHUB_BUG_REPORT_TOKEN` | Personal access token with `repo` scopes. **Keep this secret.** |
| `GITHUB_BUG_REPORT_PROJECT_COLUMN_ID` | (Optional) Classic GitHub project column ID to automatically add new bug issues to a board card. |
| `SENTRY_DSN` | Optional Sentry DSN. When set, each report emits a Sentry message with user/context tags so the issue body can cite the event id. |
| `SENTRY_RELEASE` | Optional release identifier (e.g., `target-this-role@1.2.3`). Used to annotate Sentry events. |

Without the GitHub variables the endpoint responds with `503` and code `support_config_unavailable`, so set them before enabling the feature in staging/production. Sentry is optional but recommended for richer debugging context.

### Local Docker env path

- Local API containers load bug-reporting env vars from:
  - `infra/docker/docker-compose.local.yml` -> `env_file: ../../apps/api/.env.development.local`
  - `infra/docker/docker-compose.dev.yml` -> `env_file: ../../apps/api/.env.development.local`
- Required keys in `apps/api/.env.development.local`:
  - `GITHUB_BUG_REPORT_OWNER`
  - `GITHUB_BUG_REPORT_REPO`
  - `GITHUB_BUG_REPORT_TOKEN`

## GitHub issue shaping

- Titles still start with `[BUG]` but now append a severity hint when the report content triggers the keywords (crash/data loss = `severity:high`, errors/mismatch = `severity:medium`).
- The body now includes reproducibility hints, a suggested area (Baseline Library, Results, Studio/Interview Toolkit, Auth, Upload, Scoring, Compliance), and a severity section so triage rotations know what to look at.
- Derived labels (`area:results`, `area:studio`, `area:baseline`, `area:auth`, `area:upload`, `area:scoring`, `area:compliance`, `severity:high`, `severity:medium`) are added when the heuristics are confident; the default `bug` and `beta` labels remain.

## GitHub Project support

When `GITHUB_BUG_REPORT_PROJECT_COLUMN_ID` is set, the backend attempts to create a project card for every new bug report. Failures for this optional step are logged server-side but do not block the user’s submission.

## Backend response & UI

- The `/api/support/report-bug` payload responds with `issueNumber`, `issueUrl`, and `sentryEventId` when available (GitHub/Sentry may still be optional).
- The modal success state now shows `Bug reported successfully. Reference: #123` when the backend returns an issue number; otherwise it falls back to the generic confirmation.

## Admin status

Visit `/admin/bug-reporting` inside the admin console to see whether GitHub, Sentry, and project assignment are configured for this workspace.

## Support history

- Authenticated users can visit `/support/history` (a link is also available from the settings panel) to see the bugs they submitted and whether each issue is still open or closed.
- The page remains read-only and surfaces sanitized metadata (issue number, state, severity, suggested area, a short reporter message preview, and the optional Sentry event ID) so the app never exposes raw GitHub issue bodies. GitHub remains the canonical system of record.
- The web app uses server-side proxy routes (`/api/support/report-bug` and `/api/support/history`) so GitHub credentials stay server-only.
- The `/api/support/history?page=1` API endpoint proxies a GitHub issues query filtered to the `bug` label and can page through newer or older results by adjusting the `page` query. Each response contains only the fields listed above and never returns URLs, secrets, or full issue bodies.
- Ownership is determined by an exact body line match: `- User ID: <your id>`. Matching is case-insensitive but requires an exact id (no fuzzy substring matches).
- Because matching relies on that standardized line, older reports created before the identifier was standardized may not appear in the history view even though newer ones will.

### User-facing resolution loop

- Support History now maps GitHub issue metadata into user-facing status labels:
  - `Resolved`: issue state is `closed`
  - `Fix in progress`: issue state is `open` and labels include an in-progress marker (for example `status:in-progress`, `in-progress`, or `wip`)
  - `Investigating`: issue state is `open` without in-progress labels
- The endpoint includes `updatedAt` and a `resolutionNote` when available.
- `resolutionNote` is derived from the most recent relevant issue comment and is sanitized:
  - bot comments are excluded when detectable
  - comments marked as internal/admin-only are excluded when detectable
  - text is trimmed and length-limited for a compact preview
- If no safe comment is available, `resolutionNote` is omitted (`null`).

### Still seeing this issue

- Resolved issues in Support History expose a lightweight action: **Still seeing this issue**.
- Clicking it posts a signal to `POST /support/history/still-seeing` through the web proxy.
- Behavior:
  - validates the issue belongs to the authenticated user (same deterministic ownership rule)
  - records an in-memory counter per issue number
  - includes linked fingerprint if present in issue body (`Auto error summary -> Fingerprint`)
  - does not reopen the GitHub issue
  - does not create comments or notifications in this pass
- This signal is intentionally lightweight triage input only.

## Automatic error capture and controlled escalation

- The authenticated app shell now captures:
  - `window.onerror` runtime failures
  - `unhandledrejection` promise failures
  - failed client API calls with `status >= 500`
- Captured events are posted to `/api/support/auto-error`, which proxies to backend `POST /support/auto-error`.
- Payloads are intentionally limited to normalized error metadata and lightweight context:
  - error type, message, optional stack
  - route, endpoint/method/status for API failures
  - baseline/job/analysis ids when present
  - small diagnostics snapshot (recent error events only)
- Sensitive content (resume text, large objects, raw payload dumps) is not included.

### Fingerprint and dedupe rules

- Backend computes a deterministic fingerprint from:
  - `errorType`
  - normalized message
  - normalized route
  - normalized endpoint (API errors)
- Dedupe window: **45 minutes**
- Escalation behavior:
  - create GitHub issue when fingerprint is new in-window
  - suppress duplicates during window
  - re-escalate if frequency threshold is reached (`>= 3` hits)
- Title format: `[AUTO][BUG] <summary>`
- Labels: `bug`, `auto`, and `area:*` when derivable.

## Internal Error Health view

- Internal users can open `/admin/error-health` to inspect recent fingerprint summaries from in-memory auto-error state.
- Data is read-only and intended for triage only (not a full observability dashboard).
- Each row includes:
  - fingerprint
  - normalized summary
  - source type (`runtime`, `promise`, `api`)
  - area/route
  - count
  - first seen / last seen
  - release id
  - escalation state and GitHub issue link (if available)

### Status hint rules

- `New`
  - first seen within 10 minutes
  - and count <= 2
- `Active`
  - seen within 15 minutes
  - and not marked regressed
- `Quiet`
  - not seen for more than 60 minutes
- `Regressed`
  - fingerprint appears in a different release id
  - after being quiet for more than 60 minutes
  - and has a recent hit (within 15 minutes)

### Regression detection rule

- On ingest, if:
  - incoming `releaseId` is present
  - previous bucket `releaseId` exists
  - new `releaseId` differs from previous
  - time since previous `lastSeenAt` > 60 minutes
- then fingerprint is marked as regressed in the new release.

### Authorization

- API endpoint `GET /support/error-health` is admin-only.
- Non-admin requests receive `403`.

## Critical Flow Health

- Internal users can query `GET /support/critical-flow-health` (admin-only) and view the same data in the support admin UI under **Critical Flow Health**.
- Tracked flow events:
  - `score_generated_success` / `score_generated_failure`
  - `resume_generated_success` / `resume_generated_failure`
  - `baseline_parsed_success` / `baseline_parsed_failure`
- Rolling window:
  - in-memory, last 60 minutes of events

### Threshold definitions

- `score_generated`: degraded when failure rate > 10%
- `resume_generated`: degraded when failure rate > 5%
- `baseline_parsed`: degraded when failure rate > 10%

### Status classification rules

- `Healthy`: failure rate <= threshold
- `Degraded`: threshold < failure rate <= threshold * 2
- `Critical`: failure rate > threshold * 2

### Critical escalation behavior

- On transition into `Critical`, backend may create one deduped GitHub issue:
  - title format: `[AUTO][CRITICAL] <flow> failure rate X% (threshold Y%)`
- Escalation is deduped by flow and state change:
  - no repeated issue creation while status remains `Critical`
  - additional cooldown window applies (60 minutes) before another critical escalation for the same flow

### Rate limits and fallback safety

- Backend auto-error ingestion rate limits:
  - per-user: up to 40 events / 5 minutes
  - global: up to 400 events / 5 minutes
- Oversized auto-error payloads are rejected.
- If GitHub issue creation fails for auto-escalation, ingestion still succeeds and no client flow is blocked.
- If Sentry is configured, auto-captured events include a Sentry event id when available.

## Screenshot handling

Screenshots are base64 encoded client side, but binary persistence is not implemented yet. The backend still accepts the data, mentions it in the GitHub issue, and includes a `TODO` reminder so we can plug in durable storage later.

## Local testing

1. From `apps/api`, run the focused tests:
   ```bash
   npm run test -- src/support/support.service.spec.ts src/support/dto/report-bug.dto.spec.ts
   ```
2. From `apps/web`, run the smoke tests that cover the report-bug modal and the support history view:
   ```bash
   npm run test:smoke -- apps/web/tests/report-bug-modal.test.tsx apps/web/tests/support-history-page.test.tsx
   ```
3. Run support auto-error tests from `apps/api`:
   ```bash
   npm run test -- src/support/support.service.spec.ts src/support/support.controller.spec.ts src/support/dto/auto-error.dto.spec.ts
   ```
4. Run web tests for support/admin views from `apps/web`:
   ```bash
   npm run test:smoke -- support-history-page.test.tsx admin-error-health-page.test.tsx report-bug-modal.test.tsx
   ```
5. Run the web and API servers, log in, trigger `Report a bug`, and submit the form.
6. Confirm a GitHub issue appears in the configured repo and (if Sentry is wired) the issue body references the Sentry event id.
7. Trigger a controlled runtime error in dev tools (`throw new Error('auto-capture smoke')`) and verify `/api/support/auto-error` is called once and deduped for repeats.
8. Visit `/admin/error-health` as an admin account and confirm rows show mixed statuses and issue links when escalated.

## Synthetic recovery-path coverage

- `npm run synthetic:bug-report`
- This browser synthetic transaction:
  - logs in as the synthetic user
  - opens the in-app `Report a bug` modal from the authenticated shell
  - submits `message` and `details`
  - asserts the request reaches `/api/support/report-bug`
  - fails if the payload contract breaks, validation blocks valid input, or the endpoint returns a 500
- The script logs:
  - start/end timestamps
  - request count
  - success/failure counts
  - success rate
  - observed payload fields for the contract check

## Additional notes

- The backend rate limits one report per 30 seconds per user to protect the endpoint.
- Future improvements:
  1. Persist screenshot bytes in secure storage and attach a link in the GitHub issue.
  2. Surface the GitHub issue/ID back to the UI so users can track progress.
