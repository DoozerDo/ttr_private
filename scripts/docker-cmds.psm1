<#
DEV WORKFLOW DECISION GUIDE
===========================

Use this to decide WHICH docker command to run after applying a patch.

------------------------------------------------------------
CASE 1: Patch changes Web and/or API CODE ONLY
------------------------------------------------------------
Examples:
- UI changes
- API logic changes
- Bug fixes
- No new entities
- No entity column changes

What to do:
- Usually nothing (hot reload)
- If needed:
    Restart-Both

DO NOT:
- Tear down containers
- Delete volumes
- Rebuild DB

------------------------------------------------------------
CASE 2: Patch changes npm dependencies
------------------------------------------------------------
Examples:
- package.json
- package-lock.json

What to do:
    Restart-Both

Why:
- Containers run `npm ci` on startup

------------------------------------------------------------
CASE 3: Patch changes DB SCHEMA
------------------------------------------------------------
Examples:
- New entity (new table)
- New column added to entity
- Entity decorator changes

What to do:
    Restart-Api
    (or Restart-Both)

Why:
- TypeORM applies schema updates on API startup
- Restarting DB alone does NOTHING

------------------------------------------------------------
CASE 4: Patch changes Dockerfiles or docker-compose
------------------------------------------------------------
What to do:
    Update-All

------------------------------------------------------------
CASE 5: You intentionally want a CLEAN SLATE
------------------------------------------------------------
Examples:
- Start fresh
- Debug broken migrations
- Reset test data

What to do:
    Reset-All

WARNING:
- This deletes ALL database data
- Use sparingly
#>
## Import-Module .\docker-cmds.psm1  
$script:ApiEnvFile = "apps/api/.env.development.local"
$script:ApiSharedEnvFile = ".env.dreamhost"
$script:WebEnvFile = "apps/web/.env.local"
$script:CriticalApiVars = @("APP_PUBLIC_WEB_URL", "JWT_SECRET", "REQUIRE_ACCESS_CODE")
$script:BuildBothComposeFile = "infra/docker/docker-compose.dev.yml"
$script:BuildAllComposeFile = "infra/docker/docker-compose.local.yml"

function Get-RepoRoot {
    $gitRootRaw = git rev-parse --show-toplevel 2>$null
    if (-Not $gitRootRaw) {
        throw "This directory is not inside a Git repository."
    }
    return (Resolve-Path $gitRootRaw.Trim()).Path
}

function Get-EnvValueFromFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Key
    )

    if (-Not (Test-Path $Path)) {
        return $null
    }

    $pattern = "^\s*{0}\s*=\s*(.*)\s*$" -f [Regex]::Escape($Key)
    foreach ($line in Get-Content -Path $Path) {
        if ($line -match "^\s*#" -or [string]::IsNullOrWhiteSpace($line)) {
            continue
        }
        $match = [Regex]::Match($line, $pattern)
        if ($match.Success) {
            $value = $match.Groups[1].Value.Trim()
            return $value.Trim("'").Trim('"')
        }
    }
    return $null
}

function Test-ApiCriticalEnv {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot
    )

    $apiEnvPath = Join-Path $RepoRoot $script:ApiEnvFile
    $apiSharedPath = Join-Path $RepoRoot $script:ApiSharedEnvFile

    $result = @{}
    foreach ($key in $script:CriticalApiVars) {
        $localValue = Get-EnvValueFromFile -Path $apiEnvPath -Key $key
        $sharedValue = Get-EnvValueFromFile -Path $apiSharedPath -Key $key
        $shellValue = [Environment]::GetEnvironmentVariable($key)
        $effective = if (-not [string]::IsNullOrWhiteSpace($shellValue)) {
            $shellValue
        } elseif (-not [string]::IsNullOrWhiteSpace($localValue)) {
            $localValue
        } else {
            $sharedValue
        }

        $source = if (-not [string]::IsNullOrWhiteSpace($shellValue)) {
            "shell/compose interpolation"
        } elseif (-not [string]::IsNullOrWhiteSpace($localValue)) {
            $script:ApiEnvFile
        } elseif (-not [string]::IsNullOrWhiteSpace($sharedValue)) {
            $script:ApiSharedEnvFile
        } else {
            "compose default fallback"
        }

        $result[$key] = @{
            present = -not [string]::IsNullOrWhiteSpace($effective)
            source = $source
            value = $effective
        }
    }
    return $result
}

function Show-BuildContext {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$ComposeFile
    )

    Write-Host "Build context:"
    Write-Host "  - Compose file: $ComposeFile"
    Write-Host "  - API env_file[0]: $script:ApiEnvFile"
    Write-Host "  - API env_file[1]: $script:ApiSharedEnvFile (local compose only)"
    Write-Host "  - Web env_file: $script:WebEnvFile (local compose only)"
    Write-Host "  - Env precedence: compose environment > compose env_file > default fallback"

    $status = Test-ApiCriticalEnv -RepoRoot $RepoRoot
    foreach ($key in $script:CriticalApiVars) {
        $entry = $status[$key]
        Write-Host ("  - {0}: {1} (source: {2})" -f $key, ($(if ($entry.present) { "present" } else { "missing" })), $entry.source)
    }
}

function Invoke-LocalBuildPrecheck {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    Write-Host "Precheck: api build verification"
    Push-Location $RepoRoot
    try {
        npm run build:api
        Write-Host "Precheck: web typecheck (fast fail before Docker build)"
        npm -w apps/web run typecheck:app
    } finally {
        Pop-Location
    }
}

function Show-BuildModeBanner {
    param(
        [Parameter(Mandatory = $true)][string]$Mode,
        [Parameter(Mandatory = $true)][string]$DbVolumeState,
        [Parameter(Mandatory = $true)][string]$UseWhen,
        [string]$Reason
    )

    Write-Host "Mode: $Mode"
    Write-Host "DB volume: $DbVolumeState"
    Write-Host "Use when: $UseWhen"
    if (-not [string]::IsNullOrWhiteSpace($Reason)) {
        Write-Host "Reason: $Reason"
    }
}

function Invoke-ComposeRebuild {
    param(
        [Parameter(Mandatory = $true)][string]$ComposeFile,
        [switch]$ResetDbVolume,
        [string[]]$Services,
        [switch]$NoDeps
    )

    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("GIT_SHA"))) {
        $gitSha = (git rev-parse HEAD 2>$null).Trim()
        if (-not [string]::IsNullOrWhiteSpace($gitSha)) {
            $env:GIT_SHA = $gitSha
        }
    }

    # Full schema rebuild mode explicitly tears down volumes to avoid
    # persistent local Postgres drift versus migration history.
    if ($ResetDbVolume) {
        docker compose -f $ComposeFile down -v
    }
    if ($Services -and $Services.Count -gt 0) {
        $args = @("-f", $ComposeFile, "up", "-d", "--build")
        if ($NoDeps) { $args += "--no-deps" }
        $args += $Services
        docker compose @args
    } else {
        $args = @("-f", $ComposeFile, "up", "-d", "--build")
        if ($NoDeps) { $args += "--no-deps" }
        docker compose @args
    }
}

function Get-ComposeServiceHealthState {
    param(
        [Parameter(Mandatory = $true)][string]$ComposeFile,
        [Parameter(Mandatory = $true)][string]$Service
    )

    $containerId = docker compose -f $ComposeFile ps -q $Service
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect compose service '$Service'."
    }

    $containerId = $containerId.Trim()
    if ([string]::IsNullOrWhiteSpace($containerId)) {
        return [pscustomobject]@{
            exists = $false
            status = "not_running"
            health = "not_running"
            containerId = $null
        }
    }

    $inspectFormat = "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}"
    $inspect = docker inspect --format $inspectFormat $containerId
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect container health for '$Service'."
    }

    $parts = $inspect.Trim().Split("|", 2)
    $status = if ($parts.Count -gt 0) { $parts[0] } else { "unknown" }
    $health = if ($parts.Count -gt 1) { $parts[1] } else { "none" }

    return [pscustomobject]@{
        exists = $true
        status = $status
        health = $health
        containerId = $containerId
    }
}

function Ensure-ApiAvailableForBuildBoth {
    param(
        [Parameter(Mandatory = $true)][string]$ComposeFile
    )

    $state = Get-ComposeServiceHealthState -ComposeFile $ComposeFile -Service "api"
    if (-not $state.exists) {
        Write-Host "API state: not running. Starting existing API container without rebuild..."
        docker compose -f $ComposeFile up -d --no-build api
        if ($LASTEXITCODE -ne 0) {
            throw "API is stopped and could not be started without rebuilding."
        }

        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 2
            $state = Get-ComposeServiceHealthState -ComposeFile $ComposeFile -Service "api"
            if ($state.exists -and $state.status -eq "running" -and ($state.health -eq "healthy" -or $state.health -eq "none")) {
                return $state
            }
        }

        throw "API started without rebuild but did not become healthy in time. Run Restart-Api or inspect the container logs."
    }

    if ($state.status -eq "running" -and ($state.health -eq "healthy" -or $state.health -eq "none")) {
        Write-Host "API state: healthy. Reusing existing container."
        return $state
    }

    if ($state.status -eq "running" -and $state.health -eq "unhealthy") {
        throw "API is running but unhealthy. build-both will not proceed. Run Restart-Api or inspect the container logs."
    }

    if ($state.status -in @("exited", "created", "paused")) {
        Write-Host "API state: $($state.status). Starting existing API container without rebuild..."
        docker compose -f $ComposeFile up -d --no-build api
        if ($LASTEXITCODE -ne 0) {
            throw "API is stopped and could not be started without rebuilding."
        }
        return Ensure-ApiAvailableForBuildBoth -ComposeFile $ComposeFile
    }

    throw "API is in an unexpected state ($($state.status)/$($state.health)). build-both will not proceed."
}

function Get-ChangedRepoPaths {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot
    )

    # Includes staged + unstaged changes against HEAD.
    $changed = git -C $RepoRoot diff --name-only HEAD 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to read git diff state."
    }

    # Includes untracked files.
    $untracked = git -C $RepoRoot ls-files --others --exclude-standard 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to read git untracked file state."
    }

    $allPaths = @()
    $allPaths += $changed
    $allPaths += $untracked

    return $allPaths |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_.Trim().Replace('\', '/') } |
        Sort-Object -Unique
}

function Test-IsStrictWebPresentationPath {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    if ($Path -match '^apps/web/app/api/') { return $false }
    if ($Path -match '^apps/web/app/.+/route\.[jt]sx?$') { return $false }
    if ($Path -match '^apps/web/app/') { return $true }
    if ($Path -match '^apps/web/src/components/') { return $true }
    if ($Path -match '^apps/web/components/') { return $true }
    if ($Path -match '^apps/web/tests/') { return $true }
    if ($Path -match '^apps/web/public/') { return $true }
    if ($Path -match '^apps/web/styles/') { return $true }

    if ($Path -match '^apps/web/lib/') {
        # Allow lib changes by default, but block anything that indicates
        # server/runtime/backend behavior.
        if ($Path -match '(^|/)(api|server|backend|route|routes|auth|config|settings|env|middleware|db|database|persistence|storage|cache|queue|jobs?|cron|worker|prisma|typeorm|data-source|schema|schemas|contract|contracts|secret|secrets)(/|\.|$)') {
            return $false
        }
        return $true
    }

    return $false
}

function Get-BuildBothClassification {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot
    )

    $paths = Get-ChangedRepoPaths -RepoRoot $RepoRoot
    $grouped = [ordered]@{
        "API/backend code changes" = @()
        "Server route or proxy changes" = @()
        "Shared contract/type changes" = @()
        "Persistence/schema changes" = @()
        "Auth/config/env changes" = @()
        "Build/infra/tooling changes" = @()
        "Ambiguous non-presentational runtime changes" = @()
    }

    foreach ($path in $paths) {
        if (Test-IsStrictWebPresentationPath -Path $path) {
            continue
        }

        if ($path -match '^apps/api/') {
            $grouped["API/backend code changes"] += $path
            continue
        }

        if ($path -match '^apps/web/app/api/' -or $path -match '^apps/web/app/.+/route\.tsx?$' -or $path -match '^apps/web/app/api/.+/route\.tsx?$') {
            $grouped["Server route or proxy changes"] += $path
            continue
        }

        if ($path -match '^apps/web/middleware(\.|$)' -or
            $path -match '^packages/' -or
            $path -match '^shared/' -or
            $path -match '/(schema|schemas|types?|contracts?)(/|\.|$)') {
            $grouped["Shared contract/type changes"] += $path
            continue
        }

        if ($path -match '/migrations?/' -or
            $path -match '\.entity\.ts$' -or
            $path -match 'data-source' -or
            $path -match 'typeorm' -or
            $path -match 'prisma' -or
            $path -match 'database') {
            $grouped["Persistence/schema changes"] += $path
            continue
        }

        if ($path -match '(^|/)\.env' -or
            $path -match '/env(\.|/|$)' -or
            $path -match '/auth(\.|/|$)' -or
            $path -match '/config(\.|/|$)' -or
            $path -match '/settings(\.|/|$)') {
            $grouped["Auth/config/env changes"] += $path
            continue
        }

        if ($path -match '^infra/' -or
            $path -match 'docker' -or
            $path -match '^scripts/' -or
            $path -match '(^|/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig.*\.json|turbo\.json|nx\.json|vite\.config|next\.config|webpack\.config)($|/)') {
            $grouped["Build/infra/tooling changes"] += $path
            continue
        }

        $grouped["Ambiguous non-presentational runtime changes"] += $path
    }

    $blockingGroups = [ordered]@{}
    foreach ($key in $grouped.Keys) {
        $values = @($grouped[$key] | Sort-Object -Unique)
        if ($values.Count -gt 0) {
            $blockingGroups[$key] = $values
        }
    }

    return [pscustomobject]@{
        changedFiles = $paths
        safeForBuildBoth = ($blockingGroups.Count -eq 0)
        blockingGroups = $blockingGroups
    }
}

function Show-BuildBothDecision {
    param(
        [Parameter(Mandatory = $true)]$classification
    )

    if ($classification.safeForBuildBoth) {
        Write-Host "build-both allowed: only presentation-only web files changed."
        return
    }

    Write-Host ""
    Write-Host "build-both blocked. Detected changes outside strict web-only scope."
    foreach ($group in $classification.blockingGroups.GetEnumerator()) {
        Write-Host " - $($group.Key):"
        foreach ($file in $group.Value) {
            Write-Host "   - $file"
        }
    }
    Write-Host ""
    Write-Host "Reason:"
    Write-Host "build-both is reserved for presentation-only web changes. These changes can affect API behavior, contracts, runtime state, or container stability. Use build-all instead."
    Write-Host ""
    Write-Host "Next step:"
    Write-Host "Run build-all."
}

Function Invoke-BuildBoth {
    param(
        [switch]$SkipPrecheck,
        [switch]$SkipEnvSync,
        [switch]$Force
    )

    $repoRoot = Get-RepoRoot
    Push-Location $repoRoot
    try {
        # Web/UI mode intentionally preserves DB state for fast iteration.
        Show-BuildModeBanner `
            -Mode "Web/UI rebuild" `
            -DbVolumeState "preserved" `
            -UseWhen "presentation-only web changes"

        $classification = Get-BuildBothClassification -RepoRoot $repoRoot
        if (-not $classification.safeForBuildBoth -and -not $Force) {
            Show-BuildBothDecision -classification $classification
            throw "build-both blocked due to strict web-only gate."
        }
        if (-not $classification.safeForBuildBoth -and $Force) {
            Write-Host "WARNING: build-both override enabled with -Force."
            Show-BuildBothDecision -classification $classification
        } else {
            Show-BuildBothDecision -classification $classification
        }

        if (-not $SkipEnvSync) {
            Invoke-SyncEnvFiles -RepoRoot $repoRoot -RequireSource
        }
        Show-BuildContext -RepoRoot $repoRoot -ComposeFile $script:BuildBothComposeFile
        if (-not $SkipPrecheck) {
            Invoke-LocalBuildPrecheck -RepoRoot $repoRoot
        }
        $apiStateBefore = Ensure-ApiAvailableForBuildBoth -ComposeFile $script:BuildBothComposeFile
        Write-Host "Compose scope: web service only (strict web-only mode)."
        Write-Host "API rebuild policy: never rebuild API; reuse if healthy, start existing container if stopped."
        Invoke-ComposeRebuild -ComposeFile $script:BuildBothComposeFile -Services @("web") -NoDeps
        $apiStateAfter = Get-ComposeServiceHealthState -ComposeFile $script:BuildBothComposeFile -Service "api"
        Write-Host ""
        Write-Host "Build summary:"
        Write-Host "  - Web rebuilt successfully."
        Write-Host "  - API rebuild: skipped."
        Write-Host "  - API state before: $($apiStateBefore.status)/$($apiStateBefore.health)"
        Write-Host "  - API state after: $($apiStateAfter.status)/$($apiStateAfter.health)"
        if ($apiStateAfter.status -ne "running" -or ($apiStateAfter.health -ne "healthy" -and $apiStateAfter.health -ne "none")) {
            Write-Host "  - Next action: run Restart-Api or inspect API logs before continuing."
        } else {
            Write-Host "  - Next action: none."
        }
    } finally {
        Pop-Location
    }
}

function Invoke-BuildAll {
    param(
        [switch]$SkipPrecheck,
        [switch]$SkipEnvSync
    )

    $repoRoot = Get-RepoRoot
    Push-Location $repoRoot
    try {
        # Full API/schema mode intentionally resets DB volume so migrations
        # re-run from a clean local state and avoid migration-drift confusion.
        Show-BuildModeBanner `
            -Mode "Full API/schema rebuild" `
            -DbVolumeState "RESET" `
            -UseWhen "API/entities/migrations/auth/persistence changes" `
            -Reason "prevent local migration drift"
        $classification = Get-BuildBothClassification -RepoRoot $repoRoot
        if (-not $classification.safeForBuildBoth) {
            Write-Host "Detected changes outside strict web-only scope (expected for build-all):"
            foreach ($group in $classification.blockingGroups.GetEnumerator()) {
                Write-Host " - $($group.Key):"
                foreach ($file in $group.Value) {
                    Write-Host "   - $file"
                }
            }
        }
        if (-not $SkipEnvSync) {
            Invoke-SyncEnvFiles -RepoRoot $repoRoot -RequireSource
        }
        Show-BuildContext -RepoRoot $repoRoot -ComposeFile $script:BuildAllComposeFile
        if (-not $SkipPrecheck) {
            Invoke-LocalBuildPrecheck -RepoRoot $repoRoot
        }
        Invoke-ComposeRebuild -ComposeFile $script:BuildAllComposeFile -ResetDbVolume
    } finally {
        Pop-Location
    }
}

function Restart-Both {
    docker compose -f infra\docker\docker-compose.local.yml restart api web
}

function Restart-All {
    docker compose -f infra\docker\docker-compose.local.yml restart 
}

Function Reset-Env {
    git reset --hard
    git clean -xfd

    docker compose -f infra\docker\docker-compose.local.yml down -v
    docker builder prune -af
    Invoke-SyncEnvFiles -RequireSource
}


Function Update-NPM {

    If (-Not (Get-Command git -ErrorAction SilentlyContinue)) {
        Throw "Git is not installed or not available in PATH."
    }

    $gitRootRaw = git rev-parse --show-toplevel 2>$null
    If (-Not $gitRootRaw) {
        Throw "This directory is not inside a Git repository."
    }

    $gitRoot = (Resolve-Path $gitRootRaw.Trim()).Path
    $current = (Resolve-Path $PWD.ProviderPath).Path

    If ($gitRoot -ne $current) {
        Throw "You must run this function from the root of the Git repository.`nExpected: $gitRoot`nCurrent:  $current"
    }

    $apiPath = Join-Path $gitRoot "apps\api"
    $webPath = Join-Path $gitRoot "apps\web"

    If (-Not (Test-Path $apiPath)) { Throw "Expected path not found: $apiPath" }
    If (-Not (Test-Path $webPath)) { Throw "Expected path not found: $webPath" }

    Push-Location $apiPath
    npm install
    Pop-Location

    Push-Location $webPath
    npm install
    Pop-Location
}


Function Update-All {
    docker compose -f infra\docker\docker-compose.local.yml up -d --build
}
function Invoke-SyncEnvFiles {
    param(
        [string]$RepoRoot = (Get-Location).Path,
        [string]$EnvRoot  = (Join-Path (Split-Path $RepoRoot -Parent) "TargetThisRole_env"),
        [switch]$VerboseOutput,
        [switch]$RequireSource
    )

    # --- Normalize to absolute paths ---
    $RepoRoot = (Resolve-Path $RepoRoot).Path

    If (-Not (Test-Path $EnvRoot)) {
        $message = "Env source folder not found: $EnvRoot`nCreate it (shared env source) or run build with -SkipEnvSync."
        if ($RequireSource) {
            throw $message
        }
        Write-Warning $message
        return
    }
    $EnvRoot = (Resolve-Path $EnvRoot).Path

    $copied  = 0
    $skipped = 0
    $copiedFiles = @()

    Get-ChildItem $EnvRoot -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($EnvRoot.Length).TrimStart('\')
        $destPath = Join-Path $RepoRoot $relative
        $destDir  = Split-Path $destPath -Parent

        If (-Not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }

        $shouldCopy = $true

        If (Test-Path $destPath) {
            $srcHash  = (Get-FileHash -Algorithm SHA256 -Path $_.FullName).Hash
            $destHash = (Get-FileHash -Algorithm SHA256 -Path $destPath).Hash

            If ($srcHash -eq $destHash) {
                $shouldCopy = $false
            }
        }

        If ($shouldCopy) {
            Copy-Item -Path $_.FullName -Destination $destPath -Force
            $copied++
            $copiedFiles += $relative
            If ($VerboseOutput) { Write-Host "COPY  $relative" }
        } else {
            $skipped++
            If ($VerboseOutput) { Write-Host "SKIP  $relative" }
        }
    }

    If ($copied -gt 0) {
        Write-Host "Env files copied:"
        $copiedFiles | ForEach-Object { Write-Host "  - $_" }
    }

    Write-Host "Env sync complete. Copied: $copied, Skipped (unchanged): $skipped"
}
