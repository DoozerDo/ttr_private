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

## DigitalOcean DEV Deployment (Terraform + GHCR)

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
  -var='allowed_ssh_cidrs=["YOUR_OFFICE_CIDR/32"]' \
  -var="ghcr_username=YOUR_GHCR_USERNAME" \
  -var="ghcr_token=YOUR_GHCR_PAT" \
  -var="web_image=ghcr.io/OWNER/REPO/web:dev" \
  -var="api_image=ghcr.io/OWNER/REPO/api:dev" \
  -var="certbot_email=you@example.com"
```

### DNS setup (DreamHost)
- Add A records pointing to the droplet IPv4:
  - `app.dev.targetthisrole.ai`
  - `api.dev.targetthisrole.ai`
- Keep MX records unchanged.

### Verify HTTPS
- Visit `https://app.dev.targetthisrole.ai` and `https://api.dev.targetthisrole.ai`.
- If certificates failed because DNS was not ready, re-run certbot on the droplet:
  ```
  sudo certbot --nginx -d app.dev.targetthisrole.ai -d api.dev.targetthisrole.ai --non-interactive --agree-tos --email you@example.com --redirect
  ```

### Deploy a new version
1. Push to `main` to trigger GHCR builds.
2. SSH to the droplet and pull/restart:
   ```
   cd /opt/targetthisrole
   sudo docker compose pull
   sudo docker compose up -d
   ```
