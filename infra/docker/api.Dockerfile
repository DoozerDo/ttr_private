# Builder stage installs dependencies and builds the NestJS app
FROM node:20 AS builder
WORKDIR /usr/src/app

# Install dependencies
COPY apps/api/package*.json ./
RUN npm install --no-audit --no-fund

# Copy source and build for validation
COPY apps/api ./
RUN npm run build

# Runtime image keeps things lightweight for development
FROM node:20-slim AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=development

# Bring over dependencies from the builder image
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy the application source (overridden by bind mounts in dev)
COPY apps/api ./

EXPOSE 3001
CMD ["npm", "run", "start:dev"]
