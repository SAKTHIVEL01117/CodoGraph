# syntax=docker/dockerfile:1
# ==============================================================================
# CodoGraph — Production Multi-Stage Dockerfile (Debian glibc)
# Compatible with Render Docker Web Services, Railway, Fly.io, and Docker Compose.
# ==============================================================================

FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@12.16.1

# ------------------------------------------------------------------------------
# 1. Dependencies Stage
# ------------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Copy dependency manifests and configuration
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./
RUN pnpm install

# Copy and install codograph-agent dependencies
COPY codograph-agent/package.json codograph-agent/package-lock.json* ./codograph-agent/
RUN cd codograph-agent && (npm ci || npm install)

# ------------------------------------------------------------------------------
# 2. Build Stage
# ------------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/codograph-agent/node_modules ./codograph-agent/node_modules
COPY . .

ENV NODE_ENV=production
RUN pnpm build

# ------------------------------------------------------------------------------
# 3. Production Runner Stage
# ------------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy built application and runtime dependencies
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/codograph-agent ./codograph-agent

# Set correct ownership for built-in non-root node user
RUN chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "scripts/render-start.mjs"]
