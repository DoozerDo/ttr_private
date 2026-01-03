## Import-Module .\docker-cmds.psm1  

function Build-Both {
    docker compose -f infra\docker\docker-compose.dev.yml down -v web api
    docker compose -f infra\docker\docker-compose.dev.yml up -d --build web api
}

function Build-All {
    docker compose -f infra\docker\docker-compose.dev.yml down -v 
    docker compose -f infra\docker\docker-compose.dev.yml up -d --build 
}

function Restart-Both {
    docker compose -f infra\docker\docker-compose.dev.yml restart api web
}

function Restart-All {
    docker compose -f infra\docker\docker-compose.dev.yml restart 
}

Function Reset-Env {
    git reset --hard
    git clean -xfd

    docker compose -f infra\docker\docker-compose.dev.yml down -v
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


