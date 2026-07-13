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

# --- build: compile the API, then emit a pruned production bundle to /app ---
FROM deps AS build
COPY . .
RUN pnpm --filter @accesscore/api build \
  && pnpm --filter @accesscore/api deploy --prod /app

# --- runtime: minimal image with the compiled API, prod deps, and migrations ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
# Apply migrations, then start the API. Migrations use drizzle-orm's runtime migrator
# (src/migrate.ts), so drizzle-kit is not needed in the production image.
CMD ["sh", "-c", "node dist/migrate.js && node dist/main.js"]
