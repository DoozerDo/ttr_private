#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST=${DEPLOY_HOST:?"Set DEPLOY_HOST to the droplet IP or hostname."}
DEPLOY_USER=${DEPLOY_USER:-ubuntu}
DEPLOY_PATH=${DEPLOY_PATH:-/opt/targetthisrole}
GHCR_USERNAME=${GHCR_USERNAME:?"Set GHCR_USERNAME for ghcr.io login."}
GHCR_TOKEN=${GHCR_TOKEN:?"Set GHCR_TOKEN for ghcr.io login."}
DEPLOY_ENV_FILE=${DEPLOY_ENV_FILE:-}
GIT_SHA=${GIT_SHA:-$(git rev-parse HEAD 2>/dev/null || true)}

if [[ -z "${GIT_SHA}" ]]; then
  echo "ERROR: Unable to resolve GIT_SHA for production deploy. Run from a git checkout or set GIT_SHA explicitly." >&2
  exit 1
fi

REMOTE_ENV_FILE="$(mktemp)"
cleanup() {
  rm -f "${REMOTE_ENV_FILE}" "${REMOTE_ENV_FILE}.tmp"
}
trap cleanup EXIT

if [[ -n "${DEPLOY_ENV_FILE}" ]]; then
  cp "${DEPLOY_ENV_FILE}" "${REMOTE_ENV_FILE}"
else
  : > "${REMOTE_ENV_FILE}"
fi

grep -v '^GIT_SHA=' "${REMOTE_ENV_FILE}" > "${REMOTE_ENV_FILE}.tmp" || true
mv "${REMOTE_ENV_FILE}.tmp" "${REMOTE_ENV_FILE}"
printf 'GIT_SHA=%s\n' "${GIT_SHA}" >> "${REMOTE_ENV_FILE}"

echo "Deploy preflight: GIT_SHA=${GIT_SHA}"

ssh "${DEPLOY_USER}@${DEPLOY_HOST}" "mkdir -p ${DEPLOY_PATH}"

scp infra/docker/docker-compose.dev.yml "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/docker-compose.dev.yml"
scp infra/docker/Caddyfile "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/Caddyfile"
scp "${REMOTE_ENV_FILE}" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/.env"

ssh "${DEPLOY_USER}@${DEPLOY_HOST}" "\
  echo '${GHCR_TOKEN}' | sudo docker login ghcr.io -u '${GHCR_USERNAME}' --password-stdin && \
  sudo docker compose --env-file ${DEPLOY_PATH}/.env -f ${DEPLOY_PATH}/docker-compose.dev.yml pull && \
  sudo docker compose --env-file ${DEPLOY_PATH}/.env -f ${DEPLOY_PATH}/docker-compose.dev.yml up -d"
