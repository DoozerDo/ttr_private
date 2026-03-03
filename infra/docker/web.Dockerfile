FROM node:20 AS builder
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
RUN cd apps/web && npm ci

COPY apps/web ./apps/web
RUN cd apps/web && npm run build

FROM node:20-slim AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=builder /usr/src/app/apps/web/.next ./apps/web/.next
COPY --from=builder /usr/src/app/apps/web/public ./apps/web/public
COPY --from=builder /usr/src/app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /usr/src/app/apps/web/package-lock.json ./apps/web/package-lock.json
COPY --from=builder /usr/src/app/apps/web/node_modules ./apps/web/node_modules

WORKDIR /usr/src/app/apps/web
EXPOSE 8080

CMD ["sh","-lc","npm run start -- -p ${PORT:-8080} -H 0.0.0.0"]
