# Builder stage installs dependencies and runs a production build for validation
FROM node:20 AS builder
WORKDIR /usr/src/app

COPY apps/web/package*.json ./
RUN npm ci

COPY apps/web ./
RUN npm run build

# Runtime image keeps only what's needed to run the dev server
FROM node:20-slim AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=development

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY apps/web ./

EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
