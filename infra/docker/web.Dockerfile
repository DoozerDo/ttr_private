# Builder stage installs workspace dependencies and runs a production build for validation
FROM node:20 AS builder
WORKDIR /usr/src/app

# Copy root manifests (workspaces) first for cache-friendly installs
COPY package.json package-lock.json ./

# Copy workspace package.json files so npm can validate/work with workspaces during install
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json

# Install using the root lockfile (workspaces are hoisted here)
RUN npm install --include=optional --no-audit --no-fund

# Force-install Linux native bindings for Tailwind v4 toolchain (Windows lockfiles often miss these)
RUN npm install --no-save --include=optional --no-audit --no-fund \
  --platform=linux --arch=x64 \
  lightningcss@1.30.2 @tailwindcss/oxide@4.1.18 \
  && npm rebuild lightningcss @tailwindcss/oxide

# Copy the full repo (needed for build)
COPY . .

# Build only the web workspace (validation)
ENV TTR_SILENCE_BASELINE_BROWSER_MAPPING_WARNING=1
RUN npm -w apps/web run build


# Runtime image keeps only what's needed to run the dev server
FROM node:20-slim AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=development

# Copy hoisted workspace node_modules from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy the web workspace code into the runtime image.
# NOTE: compose will bind-mount ../../apps/web to /usr/src/app during dev.
COPY --from=builder /usr/src/app/apps/web ./

EXPOSE 3000

# IMPORTANT: runtime workdir is apps/web due to bind mount, so do NOT use npm workspaces here.
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
