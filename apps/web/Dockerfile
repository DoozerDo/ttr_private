FROM node:20.19.5 AS deps
WORKDIR /usr/src/app

# Install web app dependencies from service-local lockfile
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
COPY packages ./packages
RUN npm ci --no-audit --no-fund

FROM node:20.19.5 AS builder
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/package*.json ./
COPY --from=deps /usr/src/app/apps/api/package*.json ./apps/api/
COPY --from=deps /usr/src/app/apps/web/package*.json ./apps/web/
COPY --from=deps /usr/src/app/packages ./packages
COPY . .
RUN npm run build

FROM node:20.19.5-slim AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app ./
EXPOSE 8080
CMD ["sh","-lc","npm -w apps/web run start -- -H 0.0.0.0 -p ${PORT:-8080}"]
