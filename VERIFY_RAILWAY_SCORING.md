# Railway Scoring Verification

Use these commands after a human deploys the current `develop` branch to Railway.

Set your deployed API base URL first:

```bash
export API_BASE_URL="https://your-railway-api-domain"
```

1. Verify build and scoring metadata:

```bash
curl -s "$API_BASE_URL/version" | jq '{gitSha, commitSha, scorerVersion, resumeProjectEnabled, build}'
curl -s "$API_BASE_URL/health" | jq '{gitSha, commitSha, scorerVersion, resumeProjectEnabled, build}'
```

Expected:
- `gitSha` and `commitSha` are populated
- `scorerVersion` is populated
- `resumeProjectEnabled` is `true`
- `build.scorerVersion` matches the top-level value

2. Verify the known scoring pair:

```bash
curl -s -X POST "$API_BASE_URL/analysis/run" \
  -H "Content-Type: application/json" \
  -d '{
    "baselineId":"<BASELINE_ID>",
    "jobId":"<JOB_ID>"
  }' | jq '{score, overallScore, scoring_v2: {score, scorerVersion, rubric: {resumeProject}}, breakdown, error: .error}'
```

Expected:
- `score` / `overallScore` are non-null
- `scoring_v2.scorerVersion` is populated
- `scoring_v2.rubric.resumeProject` is present
- If the invariant fires, `error.code` is `cx_fit_zero_score_invariant_failed` and the error details include `resumeProjectBreakdown`
- No response should show a legacy-only `categoryBreakdown` as the sole authority

3. Optional spot check if you have a target pair that previously failed:

```bash
curl -s -X POST "$API_BASE_URL/analysis/run" \
  -H "Content-Type: application/json" \
  -d '{
    "baselineId":"<BASELINE_ID>",
    "jobId":"<JOB_ID>",
    "debug": true
  }' | jq '{score, overallScore, scoring_v2: {score, scorerVersion, rubric}, breakdown, debug}'
```

If the deployed image is current, the response should show the Resume Project rubric data and the scorer version from the latest build.
