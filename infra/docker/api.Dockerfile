# Install full dependencies for build
FROM node:20.19.5 AS deps
WORKDIR /usr/src/app

COPY apps/api/package*.json ./
RUN npm ci --no-audit --no-fund

# Build from source and verify compiled migrations
FROM node:20.19.5 AS builder
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY apps/api/package*.json ./
COPY apps/api ./
RUN npm run build:verify

# Install production dependencies only
FROM node:20.19.5-slim AS prod-deps
WORKDIR /usr/src/app
COPY apps/api/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Runtime image
FROM node:20.19.5-slim AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV TTR_TEMPLATES_DIR=/usr/src/app/templates

COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/templates ./templates

EXPOSE 3001
CMD ["npm", "run", "start:prod"]
