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
    docker compose -f infra\docker\docker-compose.local.yml up -d --build api web
}

function Build-All {
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

Function Set-ENVFiles {

}

function Sync-EnvFiles {
    $RepoRoot = ".\TargetThisRole"
    $EnvRoot  = ".\TargetThisRole_env"

    If (-Not (Test-Path $EnvRoot)) {
        Write-Error "Env source folder not found: $EnvRoot"
        return
    }

    Get-ChildItem $EnvRoot -Recurse -File | ForEach-Object {
        $RelativePath = $_.FullName.Substring($EnvRoot.Length).TrimStart('\')
        $Destination  = Join-Path $RepoRoot $RelativePath
        $DestDir      = Split-Path $Destination -Parent

        If (-Not (Test-Path $DestDir)) {
            New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
        }

        Copy-Item -Path $_.FullName -Destination $Destination -Force
    }

    Write-Host "Env files copied into repo working directory."
}
