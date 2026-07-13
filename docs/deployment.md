# AccessCore — Deployment

> **Deployed at [auth.deviego.xyz](https://auth.deviego.xyz)** — a self-hosted
> [Dokploy](https://dokploy.com) VPS. This document describes the deployment model and what boots
> from a clean clone; the concrete, reproducible Dokploy recipe is in
> [`deploy-dokploy.md`](deploy-dokploy.md). Some hardening items remain (see the end of this doc).

## Runtime dependencies

`docker-compose.yml` provisions the full stack a clean clone needs:

| Service    | Image                  | Port   | Role                                                                                                                                                                                                                                                     |
| ---------- | ---------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | `postgres:16-alpine`   | `5432` | System of record (users, sessions, tuples, revisions, decision log). Healthchecked with `pg_isready`; data persisted in the `pgdata` volume.                                                                                                             |
| Redis      | `redis:7-alpine`       | `6379` | Token-revocation blocklist and rate limiting.                                                                                                                                                                                                            |
| Vault      | `hashicorp/vault:1.18` | `8200` | **Transit** engine holding the non-exportable Ed25519 signing key ([ADR-009](adr/009-key-management-and-cryptography.md)). Runs in **dev mode** in compose — in-memory, auto-unsealed, root token `accesscore-dev-token`. Dev mode is for local/CI only. |

The NestJS API is not in compose; it runs on the host in development
(`pnpm --filter @accesscore/api dev`, port `3000`).

## Bring it up locally

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @accesscore/api db:migrate     # drizzle-kit migrate — applies 0000–0010
pnpm --filter @accesscore/api dev            # API on :3000
```

Verify: `GET /health` returns `{"status":"ok"}` and `GET /ready` returns `{"status":"ready"}`
once Postgres accepts `SELECT 1`.

### Vault Transit signing key

With `SIGNER_DRIVER=vault` the API signs tokens via Vault's Transit engine using the key named
by `VAULT_TRANSIT_KEY` (default `accesscore-signing`), created as an `ed25519` key. In dev the
key is provisioned against the compose Vault; the integration suite
(`test/integration/vault-transit-signer.int-spec.ts`, `vault-rotation.int-spec.ts`) exercises
real signing and rotation against it. For offline work with no Vault, set `SIGNER_DRIVER=software`
to use an in-process Ed25519 key — **dev/test only**, and rejected in production (see guards
below).

## Configuration

Every variable is documented in `.env.example` and validated at boot by a Zod schema
(`apps/api/src/config/env.ts`); an invalid or missing value fails fast with a listed reason.

| Variable                | Default (dev)                                                | Purpose                                                                     |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `NODE_ENV`              | `development`                                                | `development` \| `test` \| `production`.                                    |
| `PORT`                  | `3000`                                                       | API listen port.                                                            |
| `DATABASE_URL`          | `postgres://accesscore:accesscore@localhost:5432/accesscore` | Postgres connection string.                                                 |
| `REDIS_URL`             | `redis://localhost:6379`                                     | Redis connection string.                                                    |
| `SIGNER_DRIVER`         | `vault`                                                      | `vault` (Transit, non-exportable) or `software` (in-process, dev/test).     |
| `VAULT_ADDR`            | `http://localhost:8200`                                      | Vault address.                                                              |
| `VAULT_TOKEN`           | `accesscore-dev-token`                                       | Vault auth token.                                                           |
| `VAULT_TRANSIT_KEY`     | `accesscore-signing`                                         | Transit key name used for signing.                                          |
| `JWT_ISSUER`            | `https://auth.accesscore.dev`                                | `iss` claim / expected issuer.                                              |
| `JWT_AUDIENCE`          | `accesscore`                                                 | `aud` claim / expected audience.                                            |
| `JWT_CLOCK_SKEW`        | `30`                                                         | Allowed clock skew (seconds) on verification.                               |
| `ACCESS_TOKEN_TTL`      | `900`                                                        | Access-token lifetime (seconds).                                            |
| `REFRESH_TOKEN_TTL`     | `1209600`                                                    | Refresh-token lifetime (seconds, 14 days).                                  |
| `REFRESH_GRACE_SECONDS` | `10`                                                         | Grace window for concurrent refresh.                                        |
| `JWKS_CACHE_MAX_AGE`    | `300`                                                        | `Cache-Control: max-age` on the JWKS response.                              |
| `THROTTLE_TTL_SECONDS`  | `60`                                                         | Rate-limit window.                                                          |
| `THROTTLE_LIMIT`        | `100`                                                        | Requests per window per IP (global default; `login`/`refresh` are tighter). |

No secret is ever committed; `.env` is gitignored and `.env.example` holds only non-secret dev
defaults.

## Production config guards

The env schema hard-fails at boot when `NODE_ENV=production` unless the posture is safe
(`apps/api/src/config/env.ts`):

- `SIGNER_DRIVER` **must** be `vault` — the software signer is rejected in production.
- `VAULT_TOKEN` **must not** be the dev default `accesscore-dev-token`.

These make an accidental "prod with dev crypto" deploy impossible rather than merely
discouraged.

## CI

`.github/workflows/ci.yml` runs on push to `main` and every PR. It spins up Postgres 16,
Redis 7, and Vault 1.18 as service containers, then: `pnpm install --frozen-lockfile` → `lint`
→ `typecheck` → `build` → `db:migrate` → the merged API `coverage` (unit + integration + e2e,
`nyc check-coverage` against the gate) → the SDK tests. A red gate blocks the merge.

## What's required to go live (pending)

To reach a public URL to the portfolio bar, the following are outstanding:

1. **A host + reverse proxy** — VPS with Nginx and TLS (Let's Encrypt) terminating in front of
   the API.
2. **A production Vault** — a persistent, sealed, non-dev Vault (or a cloud KMS via an ADR-009
   adapter) with a real `VAULT_TOKEN`/auth method and the Transit key provisioned and
   rotation-scheduled.
3. **Managed Postgres and Redis** — durable, backed-up instances (not the dev compose volumes),
   with the revision high-water mark preserved across restore/failover
   ([ADR-004](adr/004-authorization-consistency-model.md) monotonicity check).
4. **Real secret management** — production `DATABASE_URL`, `REDIS_URL`, Vault credentials, and
   `JWT_ISSUER`/`JWT_AUDIENCE` supplied by the platform's secret store, never in the image.
5. **A migration step in the release pipeline** — `db:migrate` run against the production
   database before the new API version serves traffic.
6. **An outbound email transport** — the dev `LogMailer` only logs that verification/reset mail
   was queued; a real transport is needed for the account-lifecycle flows end to end.

Container packaging of the API itself (a production Dockerfile + compose/orchestration entry)
lands with the public deployment; today the API runs from the host against the compose-provided
infrastructure.
