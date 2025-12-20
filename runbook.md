## Build / Start (Docker – Dev)

cd infra/docker
docker compose -f docker-compose.dev.yml up -d --build
## Docker Dev (LOQ)

### Start
cd C:\Users\micha\OneDrive\Documents\GitHub\TargetThisRole
docker compose -f infra/docker/docker-compose.dev.yml up -d --build

### Status
docker compose -f infra/docker/docker-compose.dev.yml ps

### Logs
docker compose -f infra/docker/docker-compose.dev.yml logs -f --timestamps --tail=200

### Stop
docker compose -f infra/docker/docker-compose.dev.yml down

### Rebuild API
docker compose -f infra/docker/docker-compose.dev.yml down -v api
docker compose -f infra/docker/docker-compose.dev.yml up -d --build api
docker compose -f infra/docker/docker-compose.dev.yml up -d

### Rebuild Web
docker compose -f infra/docker/docker-compose.dev.yml down -v web
docker compose -f infra/docker/docker-compose.dev.yml up -d --build web
docker compose -f infra/docker/docker-compose.dev.yml up -d

### Nuclear reset
docker compose -f infra/docker/docker-compose.dev.yml down -v
docker compose -f infra/docker/docker-compose.dev.yml up -d --build
