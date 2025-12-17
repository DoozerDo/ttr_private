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

Function Update-NPM {
    cd C:\Users\decla\Documents\GitHub\TargetThisRole\apps\api
    npm install
    cd C:\Users\decla\Documents\GitHub\TargetThisRole\apps\web
    npm install
}