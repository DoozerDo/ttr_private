FROM node:20 AS builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:20-slim AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=builder /usr/src/app ./

EXPOSE 8080
CMD ["sh","-lc","npm run start -- -H 0.0.0.0 -p ${PORT:-8080}"]