# Multi-stage build for the bordel-auth Next.js app on Railway.
#
# Build context: REPO ROOT (Railway default when dockerfilePath is set in
# railway.toml). All COPY paths are repo-root-relative and start with `web/`.
# Image layout: /app/packages/app/server.js is the standalone entry.

# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app

# Install only the manifests first so docker can cache the install layer.
# packages/app is the only workspace.
COPY web/package.json web/yarn.lock ./
COPY web/packages/app/package.json packages/app/package.json

RUN yarn install --frozen-lockfile --network-timeout 600000

# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* env vars are inlined into the client bundle at build time, so
# they have to be present in the BUILD stage (not just the runtime stage).
# Railway forwards service env vars marked "Build" as docker --build-args.
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=""
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/app/node_modules ./packages/app/node_modules

# Copy the rest of web/ (the .dockerignore at repo root prunes node_modules /
# .next etc. so this transfer stays small).
COPY web/ ./

RUN yarn workspace app build

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as non-root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone output puts everything we need under .next/standalone, preserving
# the monorepo path layout because next.config.js sets outputFileTracingRoot
# to web/. Static assets and public/ have to be copied separately.
COPY --from=builder --chown=nextjs:nodejs /app/packages/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/app/.next/static ./packages/app/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/packages/app/public ./packages/app/public

USER nextjs

# Railway sets PORT; Next standalone reads HOSTNAME and PORT.
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "packages/app/server.js"]
