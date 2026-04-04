## Local Dev (Docker)

### Start
```
docker compose -f infra/docker/docker-compose.local.yml up -d --build
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
export DEPLOY_HOST=YOUR_DROPLET_IP
export GHCR_USERNAME=YOUR_GHCR_USERNAME
export GHCR_TOKEN=YOUR_GHCR_PAT
export DEPLOY_ENV_FILE=/tmp/targetthisrole.dev.env
./infra/deploy/deploy-dev.sh
```
This copies `infra/docker/docker-compose.dev.yml` and `infra/docker/Caddyfile.dev` to `/opt/targetthisrole` on the droplet and runs `docker compose` from there.

### Verify
- API health through the proxy: `https://app.dev.targetthisrole.ai/api/health`
- Web loads and API calls work through `/api`.
