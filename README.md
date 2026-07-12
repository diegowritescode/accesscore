# AccessCore

> A self-hostable Identity & Access Management platform with a hybrid
> **ReBAC + RBAC + ABAC** authorization engine — inspired by AWS IAM's evaluation
> semantics, Google Zanzibar's relationship model, and AWS Cedar's policy language.

AccessCore is the security foundation of a larger systems portfolio: every other service
delegates authentication and authorization to it through a typed SDK. It treats
authorization as a first-class engineering problem — correct, deterministic, verifiable,
consistent, and auditable.

> **Status:** early. This repository currently contains the full design (`docs/`) and the
> **slice 0 walking skeleton**. Capabilities land as vertical slices — see
> [`docs/scope-and-roadmap.md`](docs/scope-and-roadmap.md).

## Why it's not another auth tutorial

- A real **Policy Decision Point (PDP)**: relationship tuples (Zanzibar-style), roles as
  usersets, and Cedar-like ABAC conditions, with **deny-override** evaluation and
  **explainable** decisions.
- **Consistency tokens** ("zookies") to close the new-enemy problem.
- Non-exportable **KMS/HSM signing** (HashiCorp Vault Transit), refresh-token **reuse
  detection**, tamper-evident audit.
- Full design rationale in **9 ADRs** under [`docs/adr/`](docs/adr/).

## Architecture

Hexagonal (Ports & Adapters) + DDD, as a modular monolith. Details in
[`docs/architecture.md`](docs/architecture.md).

## Monorepo layout

```
apps/
  api/         NestJS API — domain, PDP, authn
  console/     Next.js admin console (Authorization Playground, audit, users)
packages/
  sdk/         @diegowritescode/accesscore-sdk — typed client + NestJS module
  policy-engine/  the Cedar-like DSL + evaluator (fuzz/property-tested)
  contracts/   shared types/DTOs
docs/          business context, architecture, data model, security, ADRs
```

## Tech stack

Node.js · TypeScript · NestJS · **Drizzle** ORM · PostgreSQL · Redis · **HashiCorp Vault** ·
Next.js · pnpm + Turborepo · Jest · GitHub Actions.

## Quick start

```bash
corepack enable                 # or ensure pnpm 9.x is installed
pnpm install
cp .env.example .env
docker compose up -d            # Postgres, Redis, Vault
pnpm --filter @accesscore/api db:migrate
pnpm dev                        # runs the workspace in watch mode
```

Health check: `GET /health` (liveness), `GET /ready` (readiness).

## Development

```bash
pnpm lint        # ESLint
pnpm typecheck   # tsc --noEmit
pnpm test        # unit tests
pnpm build       # build all packages/apps
```

Conventions and quality gates: see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Security

This is a security product; please report vulnerabilities responsibly — see
[`SECURITY.md`](SECURITY.md). Threat model in [`docs/security.md`](docs/security.md).

## License

[Apache-2.0](LICENSE).
