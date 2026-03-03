FROM node:20 AS builder
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
RUN cd apps/web && npm ci

COPY apps/web/app ./apps/web/app
COPY apps/web/components ./apps/web/components
COPY apps/web/lib ./apps/web/lib
COPY apps/web/public ./apps/web/public
COPY apps/web/src ./apps/web/src
COPY apps/web/types ./apps/web/types
COPY apps/web/next.config.ts ./apps/web/next.config.ts
COPY apps/web/next-env.d.ts ./apps/web/next-env.d.ts
RUN cd apps/web && npm run build

FROM node:20-slim AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=builder /usr/src/app/apps/web/.next ./apps/web/.next
COPY --from=builder /usr/src/app/apps/web/public ./apps/web/public
COPY --from=builder /usr/src/app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /usr/src/app/apps/web/package-lock.json ./apps/web/package-lock.json
COPY --from=builder /usr/src/app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /usr/src/app/apps/web/next.config.ts ./apps/web/next.config.ts

WORKDIR /usr/src/app/apps/web
EXPOSE 8080

CMD ["sh","-lc","npm run start -- -H 0.0.0.0 -p ${PORT:-8080}"]
