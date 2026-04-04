# Local Dev Build Hygiene

## Env source of truth
- Shared source (optional but preferred): sibling repo folder `../TargetThisRole_env`.
- Sync destination: repo-local files copied by `Invoke-SyncEnvFiles`.
- Docker local stack:
  - API reads `apps/api/.env.development.local` and `.env.dreamhost` via `env_file`.
  - Web reads `apps/web/.env.local` via `env_file`.
- Compose `environment` keys are authoritative over `env_file` values.
- For API critical keys, compose now guarantees defaults in development:
  - `APP_PUBLIC_WEB_URL` (default `http://localhost:3000`)
  - `JWT_SECRET` (default `dev-local-super-long-random-string`)
  - `REQUIRE_ACCESS_CODE` (default `true`)

## Build helpers
- `Invoke-BuildAll` and `Invoke-BuildBoth` now:
  - sync env files (unless `-SkipEnvSync`)
  - print compose/env source summary
  - run fast precheck before Docker build (unless `-SkipPrecheck`):
    - `npm run build:api`
    - `npm -w apps/web exec tsc --noEmit`

## Next.js warnings
- `swcMinify` has been removed from `apps/web/next.config.ts` for Next 16 compatibility.
- `baseline-browser-mapping` warning is now suppressed in local docker web runtime/build via:
  - `BROWSERSLIST_IGNORE_OLD_DATA=true`
  - `BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA=true`
  - `TTR_SILENCE_BASELINE_BROWSER_MAPPING_WARNING=1`
- Reason for suppression: warning is data-age noise from transitive tooling and does not indicate a local app defect.

# API lockfile drift
- After editing `apps/api/package.json` (or any dependency referenced by the backend), regenerate the workspace-local lockfile with `cd apps/api && npm install --no-workspaces --package-lock-only` and commit the resulting `apps/api/package-lock.json`.
- Verify the Docker workflow by rerunning `docker build -f infra/docker/api.Dockerfile ...` locally so the lockfile stays compatible with the copy step that feeds `npm ci`.
