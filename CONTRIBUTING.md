# Contributing to AccessCore

Thanks for your interest. This document covers local setup and the conventions the project
enforces.

## Prerequisites

- Node.js ≥ 22 (see `.nvmrc`)
- pnpm 9.x (`corepack enable`)
- Docker (for Postgres, Redis, Vault)

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @accesscore/api db:migrate
```

## Workflow (trunk-based)

- `main` is always releasable and protected (CI must pass).
- Work on short-lived branches: `feat/…`, `fix/…`, `docs/…` — ideally one vertical slice.
- Open a PR; CI runs lint → typecheck → build → test. Merge with a squash commit.

## Commit conventions

[Conventional Commits](https://www.conventionalcommits.org/) are enforced by commitlint:
`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `perf:`, `build:`, `ci:`.

## Quality gates (run automatically)

- **pre-commit** — `lint-staged` (ESLint + Prettier on staged files)
- **commit-msg** — commitlint
- **pre-push** — `lint`, `typecheck`, `test`
- **CI** — the full pipeline against real Postgres/Redis services

## Package changes

User-facing changes to published packages (the SDK) need a changeset:

```bash
pnpm changeset
```

## Design first

Non-trivial changes should be reflected in `docs/` and, for meaningful decisions, an ADR
(`docs/adr/`). Design discipline is a core value of this project.
