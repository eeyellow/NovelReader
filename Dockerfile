# Multi-stage Dockerfile for NovelReader PWA
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat python3 make g++

# 1. Install dependencies
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Build Next.js standalone
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 3. Production runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATA_DIR="/app/data"

# Create data directories
RUN mkdir -p /app/data/uploads

# Copy public, static assets and standalone bundle
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Ensure external packages are present
COPY --from=deps /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "server.js"]
