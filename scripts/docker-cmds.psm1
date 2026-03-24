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

Function Invoke-BuildBoth {
    param(
        [switch]$SkipPrecheck,
        [switch]$SkipEnvSync
    )

    $repoRoot = Get-RepoRoot
    Push-Location $repoRoot
    try {
        if (-not $SkipEnvSync) {
            Invoke-SyncEnvFiles -RepoRoot $repoRoot -RequireSource
        }
        Show-BuildContext -RepoRoot $repoRoot -ComposeFile "infra/docker/docker-compose.dev.yml"
        if (-not $SkipPrecheck) {
            Invoke-LocalBuildPrecheck -RepoRoot $repoRoot
        }
        docker compose -f infra/docker/docker-compose.dev.yml up -d --build
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
        if (-not $SkipEnvSync) {
            Invoke-SyncEnvFiles -RepoRoot $repoRoot -RequireSource
        }
        Show-BuildContext -RepoRoot $repoRoot -ComposeFile "infra/docker/docker-compose.local.yml"
        if (-not $SkipPrecheck) {
            Invoke-LocalBuildPrecheck -RepoRoot $repoRoot
        }
        docker compose -f infra\docker\docker-compose.local.yml down -v
        docker compose -f infra\docker\docker-compose.local.yml up -d --build
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
