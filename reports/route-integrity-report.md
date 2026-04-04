# Route Integrity Report

Generated: 2026-03-25T21:04:56.291Z

## Summary

- Page routes discovered: 49
- API routes discovered: 112
- Internal references discovered: 193
- Broken internal page references: 0
- Broken API references: 3
- Likely orphaned pages: 11

## Broken Internal Page Links

- None

## Broken API Links/Proxies Referenced by UI

- Source `apps/web/app/(app)/interview-toolkit/page.tsx` -> `/api/interview-toolkit/follow-up` (missing_api_route)
- Source `apps/web/app/(app)/opportunities/page.tsx` -> `/api/opportunities${query ` (missing_api_route)
- Source `apps/web/lib/session.ts` -> `/api/session/last-analysis` (missing_api_route)

## Orphaned Routes

- /applications (likely_orphaned)
- /awaiting-access (likely_orphaned)
- /calibrate (likely_orphaned)
- /cover-letters (likely_orphaned)
- /fit-review (likely_orphaned)
- /interview-toolkit/resources (likely_orphaned)
- /jobs/new (likely_orphaned)
- /reality-check (likely_orphaned)
- /redeem (likely_orphaned)
- /settings (likely_orphaned)
- /waitlist (likely_orphaned)

## Dynamic/Unresolved Targets

- Source `apps/web/app/(app)/admin/beta-friction-dashboard/page.tsx` -> `/api/admin/feedback/${id}` (dynamic_api_route)
- Source `apps/web/app/(app)/admin/beta-friction-dashboard/page.tsx` -> `/api/admin/friction-events/${id}` (dynamic_api_route)
- Source `apps/web/app/(app)/admin/bugs/[id]/page.tsx` -> `/api/admin/bug-reports/${id}` (dynamic_api_route)
- Source `apps/web/app/(app)/admin/bugs/[id]/page.tsx` -> `/api/admin/bug-reports/${id}` (dynamic_api_route)
- Source `apps/web/app/(app)/baseline/baseline-dashboard.tsx` -> `/api/baselines/${encodeURIComponent(baselineId)}` (dynamic_api_route)
- Source `apps/web/app/(app)/baseline/BaselineStudioHome.tsx` -> `/api/baselines/${encodeURIComponent(baselineId)}` (dynamic_api_route)
- Source `apps/web/app/(app)/baseline/BaselineStudioHome.tsx` -> `/api/baselines/${encodeURIComponent(baselineId)}/analysis-score` (dynamic_api_route)
- Source `apps/web/app/(app)/baseline/BaselineStudioHome.tsx` -> `/api/baselines/${encodeURIComponent(primaryBaselineId)}/strengthening-additions` (dynamic_api_route)
- Source `apps/web/app/(app)/baseline/[id]/baseline-policy-editor.tsx` -> `/api/baselines/${baselineId}/blocks` (dynamic_api_route)
- Source `apps/web/app/(app)/baseline/[id]/baseline-policy-editor.tsx` -> `/api/baselines/${baselineId}/versions` (dynamic_api_route)
- Source `apps/web/app/(app)/baseline/[id]/baseline-policy-editor.tsx` -> `/api/baselines/${baselineId}/blocks` (dynamic_api_route)
- Source `apps/web/app/(app)/fit-review/FitReviewClient.tsx` -> `/interviews/${encodeURIComponent(interviewId)}` (dynamic_page_route)
- Source `apps/web/app/(app)/fit-review/FitReviewClient.tsx` -> `/api/analysis/job/${encodeURIComponent(resolvedJobId)}/latest` (dynamic_api_route)
- Source `apps/web/app/(app)/interview-toolkit/page.tsx` -> `/api/analysis/fit-assessments/${encodeURIComponent(assessmentId)}` (dynamic_api_route)
- Source `apps/web/app/(app)/opportunities/page.tsx` -> `/api/analysis/fit-assessments/${encodeURIComponent(analysisId)}` (dynamic_api_route)
- Source `apps/web/app/(app)/opportunities/page.tsx` -> `/api/baselines/${encodeURIComponent(baselineId)}/versions` (dynamic_api_route)
- Source `apps/web/app/(app)/opportunities/page.tsx` -> `/api/opportunities/${encodeURIComponent(id)}` (dynamic_api_route)
- Source `apps/web/app/(app)/results/components/FitImprovementOpportunities.tsx` -> `/api/analysis/fit-assessments/${encodeURIComponent(assessmentId)}/simulation` (dynamic_api_route)
- Source `apps/web/app/(app)/results/page.tsx` -> `/api/baselines/${encodeURIComponent(baselineIdValue)}/versions` (dynamic_api_route)
- Source `apps/web/app/(app)/results/page.tsx` -> `/api/analysis/fit-assessments/${encodeURIComponent(assessmentId)}` (dynamic_api_route)
- Source `apps/web/app/(app)/results/page.tsx` -> `/api/analysis/job/${encodeURIComponent(targetJobId)}/baseline/${encodeURIComponent(targetBaselineId)}/latest` (dynamic_api_route)
- Source `apps/web/app/(app)/results/page.tsx` -> `/api/opportunities/${encodeURIComponent(match.id)}` (dynamic_api_route)
- Source `apps/web/app/(app)/studio/page.tsx` -> `/api/applications/${encodeURIComponent(trackerEntryId)}` (dynamic_api_route)
- Source `apps/web/app/(app)/studio/page.tsx` -> `/api/baselines/${encodeURIComponent(selectedBaselineId)}/versions` (dynamic_api_route)
- Source `apps/web/app/(app)/studio/page.tsx` -> `/api/cover-letters/${encodeURIComponent(coverLetterId)}` (dynamic_api_route)

## Runtime Checks

### user

- Page checks: 45, failures: 25
- API checks: 77, failures: 64
- Page `/admin/bugs` -> missing_target (0)
- Page `/admin/error-health` -> missing_target (0)
- Page `/admin/product-signal` -> missing_target (0)
- Page `/admin/user-engagement` -> missing_target (0)
- Page `/analyze` -> missing_target (0)
- Page `/applications` -> missing_target (0)
- Page `/auth/access-code` -> missing_target (0)
- Page `/auth/confirm` -> missing_target (0)
- Page `/auth/login` -> missing_target (0)
- Page `/awaiting-access` -> missing_target (0)
- Page `/calibrate` -> missing_target (0)
- Page `/interview-toolkit` -> missing_target (0)
- Page `/interview-toolkit/resources` -> missing_target (0)
- Page `/job-tracker` -> missing_target (0)
- Page `/jobs` -> missing_target (0)
- Page `/jobs/new` -> missing_target (0)
- Page `/onboarding/profile` -> missing_target (0)
- Page `/reality-check` -> missing_target (0)
- Page `/redeem` -> missing_target (0)
- Page `/results` -> missing_target (0)
- Page `/settings` -> missing_target (0)
- Page `/studio` -> missing_target (0)
- Page `/support/history` -> missing_target (0)
- Page `/target` -> missing_target (0)
- Page `/waitlist` -> missing_target (0)
- API `/api/analytics/beta-command-center` -> missing_target (0)
- API `/api/beta-feedback` -> missing_target (0)
- API `/api/beta-feedback/summary` -> missing_target (0)
- API `/api/admin/feedback` -> missing_target (0)
- API `/api/admin/friction-events` -> unauthorized (401)
- API `/api/admin/friction-patterns` -> missing_target (0)
- API `/api/admin/friction-events/run-detection` -> missing_target (0)
- API `/api/support/config` -> unauthorized (401)
- API `/api/admin/bug-reports` -> unauthorized (401)
- API `/api/admin/bug-reports/${id}` -> missing_target (0)
- API `/api/support/error-health` -> missing_target (0)
- API `/api/support/critical-flow-health` -> missing_target (0)
- API `/api/admin/funnel-metrics` -> missing_target (0)
- API `/api/admin/funnel-users` -> unauthorized (401)
- API `/api/admin/funnel-segments` -> unauthorized (401)
- API `/api/admin/product-signal` -> missing_target (0)
- API `/api/admin/investor-snapshot` -> missing_target (0)
- API `/api/admin/user-engagement-states` -> missing_target (0)
- API `/api/admin/user-triggers` -> missing_target (0)
- API `/api/admin/run-trigger-evaluation` -> missing_target (0)
- API `/api/admin/generate-outreach-draft` -> missing_target (0)
- API `/api/baselines` -> missing_target (0)
- API `/api/jobs` -> missing_target (0)
- API `/api/analysis/run` -> missing_target (0)
- API `/api/baselines/${encodeURIComponent(baselineId)}` -> unauthorized (401)
- API `/api/analysis/history` -> unauthorized (401)
- API `/api/baselines/${baselineId}/blocks` -> unauthorized (401)
- API `/api/baselines/${baselineId}/versions` -> missing_target (0)
- API `/api/calibration` -> missing_target (0)
- API `/api/auth/logout` -> missing_target (0)
- API `/api/feedback` -> missing_target (0)
- API `/api/status` -> missing_target (0)
- API `/api/cover-letters` -> unauthorized (401)
- API `/api/cover-letters/export` -> missing_target (0)
- API `/api/analysis/job/${encodeURIComponent(resolvedJobId)}/latest` -> missing_target (0)
- API `/api/interviews/start` -> missing_target (0)
- API `/api/analysis/fit-assessments/${encodeURIComponent(assessmentId)}` -> missing_target (0)
- API `/api/interview-toolkit/follow-up` -> missing_target (0)
- API `/api/job-tracker/export.csv` -> missing_target (0)
- API `/api/jobs/ingest` -> missing_target (0)
- API `/api/opportunities${query ` -> missing_target (0)
- API `/api/analysis/fit-assessments/${encodeURIComponent(analysisId)}` -> unauthorized (401)
- API `/api/baselines/${encodeURIComponent(baselineId)}/versions` -> missing_target (0)
- API `/api/opportunities/${encodeURIComponent(id)}` -> missing_target (0)
- API `/api/analysis/career-gravity` -> missing_target (0)
- API `/api/analysis/fit-assessments/${encodeURIComponent(assessmentId)}/simulation` -> missing_target (0)
- API `/api/analysis/fit-assessments` -> missing_target (0)
- API `/api/users/me/last-assessment` -> missing_target (0)
- API `/api/applications/insights` -> missing_target (0)
- API `/api/baselines/${encodeURIComponent(baselineIdValue)}/versions` -> unauthorized (401)
- API `/api/resume/readiness` -> missing_target (0)
- API `/api/cover-letters/readiness` -> missing_target (0)
- API `/api/analysis/job/${encodeURIComponent(targetJobId)}/baseline/${encodeURIComponent(targetBaselineId)}/latest` -> missing_target (0)
- API `/api/opportunities` -> missing_target (0)
- API `/api/applications/${encodeURIComponent(trackerEntryId)}` -> unauthorized (401)
- API `/api/baselines/${encodeURIComponent(selectedBaselineId)}/versions` -> missing_target (0)
- API `/api/resume` -> missing_target (0)
- API `/api/resume/export` -> missing_target (0)
- API `/api/cover-letters/${encodeURIComponent(coverLetterId)}` -> missing_target (0)
- API `/api/support/history` -> unauthorized (401)
- API `/api/users/me` -> unauthorized (401)
- API `/api/users/me/profile` -> missing_target (0)
- API `/api/preview/compatibility-score` -> missing_target (0)
- API `/api/session/last-analysis` -> missing_target (0)
