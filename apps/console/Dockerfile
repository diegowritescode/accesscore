# syntax=docker/dockerfile:1

# Build context is the repository root (pnpm + Turborepo workspace).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# --- deps: install the whole workspace from the lockfile (manifests only, for cache) ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/console/package.json ./apps/console/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/policy-engine/package.json ./packages/policy-engine/package.json
RUN pnpm install --frozen-lockfile

# --- build: compile the console to Next.js standalone output ---
FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm --filter @accesscore/console build

# --- runtime: minimal image running the standalone server ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/console/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/console/.next/static ./apps/console/.next/static
USER node
EXPOSE 3001
CMD ["node", "apps/console/server.js"]
