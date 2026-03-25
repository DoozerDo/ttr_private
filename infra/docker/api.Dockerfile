# Install workspace-aware dependencies for API build
FROM node:20.19.5 AS deps
WORKDIR /usr/src/workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace apps/api --include-workspace-root=false --ignore-scripts --no-audit --no-fund

# Build from source and verify compiled migrations
FROM node:20.19.5 AS builder
WORKDIR /usr/src/workspace
COPY --from=deps /usr/src/workspace/node_modules ./node_modules
COPY --from=deps /usr/src/workspace/package.json ./package.json
COPY --from=deps /usr/src/workspace/package-lock.json ./package-lock.json
COPY --from=deps /usr/src/workspace/apps ./apps
COPY apps/api ./apps/api
RUN npm -w apps/api run build:verify

# Install workspace-aware production dependencies only
FROM node:20.19.5-slim AS prod-deps
WORKDIR /usr/src/workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace apps/api --include-workspace-root=false --omit=dev --ignore-scripts --no-audit --no-fund

# Runtime image
FROM node:20.19.5-slim AS runtime
WORKDIR /usr/src/app/apps/api
ENV NODE_ENV=production
ENV TTR_TEMPLATES_DIR=/usr/src/app/apps/api/templates

COPY --from=prod-deps /usr/src/workspace/node_modules /usr/src/app/node_modules
COPY --from=builder /usr/src/workspace/apps/api/package.json ./package.json
COPY --from=builder /usr/src/workspace/apps/api/dist ./dist
COPY --from=builder /usr/src/workspace/apps/api/templates ./templates

EXPOSE 3001
CMD ["sh", "-c", "npm run migration:run && npm run start:prod"]
