## Local Dev (Docker)

### Start
Prereq: Docker Desktop must be running (Linux containers / WSL2 backend on Windows).
```
docker compose -f infra/docker/docker-compose.local.yml up -d --build
```

## Production beta-loop validation (operator)

Goal: allow an operator to run the full beta tester loop end-to-end **without** disabling access-code gating or adding any new bypass.

### Canonical approach: founder-allowlisted operator account
Production supports a safe operator-only path via the existing **founder allowlist**:
- `FOUNDER_EMAILS` (prod env) bypasses access-code enforcement and admin guards for that allowlisted email only.
- This does **not** disable auth; the operator still signs up / logs in normally.

Steps (non-secret):
1. Ensure production `FOUNDER_EMAILS` includes a dedicated operator email (e.g. `beta-ops-validation@yourdomain.com`). Do this via normal secret/env management for the production deployment.
2. In production UI, create the account using that email (signup), then complete email confirmation if required.
3. Log in with that operator account and run the beta loop (baseline -> target role -> compatibility -> Studio -> resume + cover -> package export -> reload).

Notes:
- This account should be used only for validation and should not be shared with normal beta testers.
- If you prefer not to grant founder allowlist access to an operator, you must provision an access code via a trusted admin user (see API `POST /admin/access-codes`) and assign it to the test user **before** first login so auto-redeem can succeed.

## Production beta tester provisioning (operator)

Goal: provision/revoke **non-founder** beta testers in production without disabling access-code gating and without exposing public admin routes.

### Security boundary
- Requires normal authentication (JWT cookie via `/auth/login`)
- Requires caller email to be in `FOUNDER_EMAILS` (founder allowlist)

### Workflow
1. Tester signs up in production (and confirms email if required).
2. Founder/operator logs in to production.
3. Founder/operator provisions access for the tester email:
   - `POST /ops/beta/provision` with `{ "email": "tester@example.com", "notes": "beta cohort A" }`
4. Tester logs in normally; assigned code is auto-redeemed on first login when access-code gating is enabled.
5. To revoke access later:
   - `POST /ops/beta/revoke` with `{ "email": "tester@example.com", "reason": "beta ended" }`
6. To verify access status:
   - `GET /ops/beta/status?email=tester@example.com`

## Production routing note (Railway single-service)

If production is deployed as a single Next.js service (no external reverse proxy like Caddy), `/api/*` is served by Next.js route handlers.
To ensure `/api/*` reaches the Nest API service:
- `/api/status` proxies to the API `/status` endpoint.
- `/api/ops/beta/*` proxies to API `/ops/beta/*` (founder-only endpoints).

Operator note: after landing routing/proxy changes, trigger a fresh web deploy before validating `/api/status` and `/api/ops/beta/*`.

## Production beta-ops validation (founder operator, local PowerShell)

Goal: validate production beta onboarding/offboarding end-to-end **without** pasting tokens into chat/logs and **without** printing access codes.

### Prereqs (local shell only)
- Set founder bearer token (do not echo it):
  - `$env:TTR_FOUNDER_TOKEN="..."`
- Set disposable tester email:
  - `$env:TTR_BETA_TEST_EMAIL="ttr-beta-ops-validate+<unique>@example.com"`
- Optional override (defaults to production):
  - `$env:TTR_BASE_URL="https://targetthisrole.com"`

### Command sequence (PowerShell-safe; uses Invoke-RestMethod)
```powershell
$ErrorActionPreference = "Stop"

$base = ($env:TTR_BASE_URL ?? "https://targetthisrole.com").TrimEnd("/")
$email = ($env:TTR_BETA_TEST_EMAIL ?? "").Trim()
$token = ($env:TTR_FOUNDER_TOKEN ?? "").Trim()

if (-not $email) { throw "Missing TTR_BETA_TEST_EMAIL" }
if (-not $token) { throw "Missing TTR_FOUNDER_TOKEN" }

$statusUrl = "$base/api/ops/beta/status?email=$([Uri]::EscapeDataString($email))"
$provisionUrl = "$base/api/ops/beta/provision"
$revokeUrl = "$base/api/ops/beta/revoke"

Write-Host "1) Unauthenticated status should be 401"
try {
  Invoke-RestMethod -Method GET -Uri $statusUrl -Headers @{} | Out-Null
  throw "Expected 401 but request succeeded"
} catch {
  $resp = $_.Exception.Response
  if ($resp -and $resp.StatusCode.value__ -eq 401) { Write-Host "OK: 401" } else { throw $_ }
}

$authHeaders = @{ Authorization = "Bearer $token" }

Write-Host "2) Founder-authenticated status should succeed"
$s0 = Invoke-RestMethod -Method GET -Uri $statusUrl -Headers $authHeaders
$s0 | Select-Object ok,email,hasActiveAccess | Format-List

Write-Host "3) Provision (do NOT print accessCode)"
$prov = Invoke-RestMethod -Method POST -Uri $provisionUrl -Headers $authHeaders -ContentType "application/json" `
  -Body (@{ email = $email; notes = "prod beta-ops validation" } | ConvertTo-Json)

# Never print $prov.accessCode
$prov | Select-Object ok,email,userId,accessCodeId,status,@{Name="accessCodeReturned";Expression={ [bool]($_.accessCode) }} | Format-List

Write-Host "4) Status after provision should show active/assigned access (at minimum a code row exists)"
$s1 = Invoke-RestMethod -Method GET -Uri $statusUrl -Headers $authHeaders
$codeCount = @($s1.codes).Count
$s1 | Select-Object ok,email,hasActiveAccess,@{Name="codesCount";Expression={$codeCount}} | Format-List

Write-Host "5) Revoke"
$rev = Invoke-RestMethod -Method POST -Uri $revokeUrl -Headers $authHeaders -ContentType "application/json" `
  -Body (@{ email = $email; reason = "prod beta-ops validation revoke" } | ConvertTo-Json)
$rev | Select-Object ok,email,userId,revokedCount,alreadyRevokedCount | Format-List

Write-Host "6) Status after revoke should show hasActiveAccess=false"
$s2 = Invoke-RestMethod -Method GET -Uri $statusUrl -Headers $authHeaders
$codeCount2 = @($s2.codes).Count
$s2 | Select-Object ok,email,hasActiveAccess,@{Name="codesCount";Expression={$codeCount2}} | Format-List
```

### Success criteria
- Step (1) returns **401** (auth enforced).
- Step (2) returns **200** and a payload with `ok=true`.
- Step (3) returns **200** and `accessCodeReturned=true` but **does not print the access code**.
- Step (4) shows `codesCount >= 1` and typically `hasActiveAccess=true` after the tester has logged in (note: provision assigns a code; active access becomes true once redeemed).
- Step (5) returns **200** with a non-negative `revokedCount`.
- Step (6) shows `hasActiveAccess=false` after revocation (and the tester should lose gated access after their next request).

Status field meanings:
- `hasActiveAccess`: tester has redeemed, non-revoked access (gating will pass).
- `hasAssignedAccessCode`: tester has an assigned, unused, non-revoked access code (provisioned but not yet redeemed).
- `canRedeemAccess`: equivalent to `hasAssignedAccessCode` (tester can redeem by logging in with their assigned code flow).

### Failure classification hints
- 404 / HTML response: wrong deployment or route not present (web build not active).
- 500 `API base URL is not configured`: production web missing `API_BASE_URL`/`NEXT_PUBLIC_API_BASE_URL`.
- 401 even with token: token expired/invalid or not a founder session.
- 403: founder allowlist (`FOUNDER_EMAILS`) not configured for the operator email.

### Canonical synthetic validation (Docker)
```
docker compose -f infra/docker/docker-compose.dev.yml up -d --build
docker compose -f infra/docker/docker-compose.dev.yml exec api npm run seed:synthetic-admin
$env:BASE_URL="http://localhost:3000"
$env:API_BASE_URL="http://localhost:3001"
$env:SYNTHETIC_USER_EMAIL="michaeltalbert@hotmail.com"
$env:SYNTHETIC_USER_PASSWORD="FounderTTR2026!"
npm run synthetic:core-loop-smoke
```

### Status
```
docker compose -f infra/docker/docker-compose.local.yml ps
```

### Logs
```
docker compose -f infra/docker/docker-compose.local.yml logs -f --timestamps --tail=200
```

### Stop
```
docker compose -f infra/docker/docker-compose.local.yml down
```

### Rebuild API
```
docker compose -f infra/docker/docker-compose.local.yml down -v api
docker compose -f infra/docker/docker-compose.local.yml up -d --build api
docker compose -f infra/docker/docker-compose.local.yml up -d
```

### Rebuild Web
```
docker compose -f infra/docker/docker-compose.local.yml down -v web
docker compose -f infra/docker/docker-compose.local.yml up -d --build web
docker compose -f infra/docker/docker-compose.local.yml up -d
```

### Nuclear reset
```
docker compose -f infra/docker/docker-compose.local.yml down -v
docker compose -f infra/docker/docker-compose.local.yml up -d --build
```

## DigitalOcean Dev Deployment (Terraform + GHCR)

### Prereqs
- Terraform installed.
- DigitalOcean API token available.
- GHCR images built via GitHub Actions (see `.github/workflows/build-dev-images.yml`).
- Optional: set `GHCR_PAT` repo secret if you prefer a PAT over the default `GITHUB_TOKEN` for GHCR pushes.
- SSH key uploaded to DigitalOcean.

### Terraform init/apply
```
cd infra/terraform
terraform init
terraform apply \
  -var="git_sha=$(git rev-parse HEAD)" \
  -var="do_token=YOUR_DO_TOKEN" \
  -var='ssh_key_fingerprints=["YOUR_SSH_FINGERPRINT"]' \
  -var='allowed_ssh_cidrs=["YOUR_OFFICE_CIDR/32"]'
```

### DNS setup (DreamHost)
- Add an A record pointing to the droplet IPv4:
  - `app.dev.targetthisrole.ai`
- Keep MX records unchanged.

### Configure environment
1. Copy the env template and fill in values:
   ```
   cp infra/docker/.env.example /tmp/targetthisrole.dev.env
   ```
2. Populate `DATABASE_URL` using the database host/port outputs and the generated DB user password:
   ```
   cd infra/terraform
   terraform output -raw postgres_host
   terraform output -raw postgres_port
   terraform state show digitalocean_database_user.api_user
   ```
3. Update `CORS_ORIGIN` to allow the app domain (e.g. `https://app.dev.targetthisrole.ai`).

### Deploy a new version
```
cd infra/terraform
terraform apply \
  -var="git_sha=$(git rev-parse HEAD)" \
  -var="do_token=YOUR_DO_TOKEN" \
  -var='ssh_key_fingerprints=["YOUR_SSH_FINGERPRINT"]' \
  -var='allowed_ssh_cidrs=["YOUR_OFFICE_CIDR/32"]'
```
This updates the droplet bootstrap path, writes the resolved `GIT_SHA` into `/opt/targetthisrole/.env`, and runs the canonical `up.sh` preflight before Docker Compose starts the web and API containers.

### Verify
- API health through the proxy: `https://app.dev.targetthisrole.ai/api/health`
- Web loads and API calls work through `/api`.
