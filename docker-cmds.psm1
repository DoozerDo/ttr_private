## Import-Module .\docker-cmds.psm1  

function Build-Both {
    docker compose -f infra\docker\docker-compose.dev.yml down -v web api
    docker compose -f infra\docker\docker-compose.dev.yml up -d --build web api
}

function Restart-Both {
    docker compose -f infra\docker\docker-compose.dev.yml restart api 
}