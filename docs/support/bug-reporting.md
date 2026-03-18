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

Without the GitHub variables the endpoint responds with `500`, so set them before enabling the feature in staging/production. Sentry is optional but recommended for richer debugging context.

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
- The `/api/support/history?page=1` endpoint proxies a GitHub search filtered to the `bug` label and can page through newer or older results by adjusting the `page` query. Each response contains only the fields listed above and never returns URLs, secrets, or full issue bodies.
- Ownership is determined by the `- User ID: <your id>` line that every bug report already writes to the GitHub issue body. Because matching relies on that snippet, older reports created before the identifier was standardized may not appear in the history view even though newer ones will.

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
3. Run the web and API servers, log in, trigger `Report a bug`, and submit the form.
4. Confirm a GitHub issue appears in the configured repo and (if Sentry is wired) the issue body references the Sentry event id.

## Additional notes

- The backend rate limits one report per 30 seconds per user to protect the endpoint.
- Future improvements:
  1. Persist screenshot bytes in secure storage and attach a link in the GitHub issue.
  2. Surface the GitHub issue/ID back to the UI so users can track progress.
