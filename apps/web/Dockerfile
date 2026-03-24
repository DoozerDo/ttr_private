FROM node:20.19.5 AS deps
WORKDIR /usr/src/app

# Workspace-aware install driven by root package-lock.json
COPY package*.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace=apps/web --include-workspace-root

FROM node:20.19.5 AS builder
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/package*.json ./
COPY --from=deps /usr/src/app/apps/web/package.json ./apps/web/package.json
COPY apps/web ./apps/web
RUN npm -w apps/web run build

FROM node:20.19.5-slim AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/apps/web ./apps/web

WORKDIR /usr/src/app/apps/web
EXPOSE 8080
CMD ["sh","-lc","npm run start -- -H 0.0.0.0 -p ${PORT:-8080}"]
