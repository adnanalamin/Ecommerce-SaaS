# NEXORA Multi-Tenant SaaS E-Commerce Platform
# Production & Development Multi-Stage Dockerfile

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl python3 make g++

FROM base AS dependencies
COPY package*.json ./
RUN npm ci --prefer-offline

FROM base AS builder
COPY package*.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production --prefer-offline && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["npx", "tsx", "server.ts"]
