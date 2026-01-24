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




Function Build-Both {
    Sync-EnvFiles
    docker compose -f infra\docker\docker-compose.local.yml up -d --build api web
}

function Build-All {
    Sync-EnvFiles
    docker compose -f infra\docker\docker-compose.local.yml down -v 
    docker compose -f infra\docker\docker-compose.local.yml up -d --build 
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
    Sync-EnvFiles
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

function Sync-EnvFiles {
    param(
        # If you call this from Build-All while your current directory is the repo root,
        # you can leave this alone.
        [string]$RepoRoot = (Get-Location).Path,

        # By default, expect TargetThisRole_env to be a sibling of the repo root folder.
        # Example:
        #   C:\...\GitHub\TargetThisRole
        #   C:\...\GitHub\TargetThisRole_env
        [string]$EnvRoot = (Join-Path (Split-Path $RepoRoot -Parent) "TargetThisRole_env"),

        # If set, print every file decision (Skip/Copy)
        [switch]$VerboseOutput
    )

    # --- Normalize to absolute paths ---
    $RepoRoot = (Resolve-Path $RepoRoot).Path

    If (-Not (Test-Path $EnvRoot)) {
        Write-Error "Env source folder not found: $EnvRoot"
        return
    }
    $EnvRoot = (Resolve-Path $EnvRoot).Path

    $copied = 0
    $skipped = 0

    Get-ChildItem $EnvRoot -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($EnvRoot.Length).TrimStart('\')
        $destPath = Join-Path $RepoRoot $relative
        $destDir  = Split-Path $destPath -Parent

        If (-Not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }

        $shouldCopy = $true

        If (Test-Path $destPath) {
            # Compare file content using hashes (fast and reliable for small env files)
            $srcHash  = (Get-FileHash -Algorithm SHA256 -Path $_.FullName).Hash
            $destHash = (Get-FileHash -Algorithm SHA256 -Path $destPath).Hash

            If ($srcHash -eq $destHash) {
                $shouldCopy = $false
            }
        }

        If ($shouldCopy) {
            Copy-Item -Path $_.FullName -Destination $destPath -Force
            $copied++
            If ($VerboseOutput) { Write-Host "COPY  $relative" }
        } else {
            $skipped++
            If ($VerboseOutput) { Write-Host "SKIP  $relative" }
        }
    }

    Write-Host "Env sync complete. Copied: $copied, Skipped (unchanged): $skipped"
}