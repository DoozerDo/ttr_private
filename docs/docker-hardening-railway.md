# Docker/Railway Build Hardening (2026-03-24)

This pass hardens image build determinism and reduces noisy build context for Railway-style remote Docker builds.

## Changes made

- Pinned all Node base images used by production-relevant Dockerfiles:
  - `infra/docker/api.Dockerfile`
    - `node:20.19.5`
    - `node:20.19.5-slim`
  - `apps/web/Dockerfile`
    - `node:20.19.5`
    - `node:20.19.5-slim`
- Expanded root `.dockerignore` to exclude VCS metadata, local env files, logs, caches, test artifacts, and non-build repo directories (`archive`, `artifacts`, `Clearbase`, `docs`).
- Reduced web builder layer churn by replacing full-repo source copy with a scoped copy:
  - `COPY . .` -> `COPY apps/web ./apps/web`
- Fixed production compose port alignment for web runtime:
  - `infra/docker/docker-compose.prod.yml` now maps `3000:8080` to match the web container start command default (`PORT` fallback to `8080`).

## Determinism and reliability impact

- Explicit Node tags reduce unplanned base image drift.
- Smaller build context reduces upload size and the chance of context-related build instability.
- Scoped source copy improves Docker layer cache stability by avoiding unrelated monorepo file churn invalidating web build layers.
- Install flow remains deterministic (`npm ci`) and unchanged in behavior.

## Remaining external risk

- Transient Docker Hub/network issues (for example, pull interruptions from `registry-1.docker.io`) cannot be fully eliminated in repo code alone.
- This hardening reduces build fragility but does not replace registry/network-side reliability controls.

## Follow-up context fix (2026-03-24)

- Root cause: web Dockerfile `COPY` statements were written for repo-root build context (`COPY apps/web/...`), but Railway web builds were using service-scoped context (`apps/web`). This caused `"/apps/web/package.json": not found`.
- Fix:
  - Converted `apps/web/Dockerfile` to service-scoped copy/install paths (`COPY package*.json ./`, `COPY . .`).
  - Updated compose web build context to `../../apps/web` with `dockerfile: Dockerfile`.
  - Added `apps/web/.dockerignore` for service-scoped context hygiene.
- Rule of thumb:
  - If Docker build context is `apps/web`, all `COPY` paths must be relative to `apps/web` and must not prefix `apps/web/`.
