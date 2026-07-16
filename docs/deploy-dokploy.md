# Deploying AccessCore on Dokploy

> **Live instance:** [auth.deviego.xyz](https://auth.deviego.xyz), deployed with exactly this recipe.

A concrete recipe for a self-hosted [Dokploy](https://dokploy.com) instance. Four resources in
one Dokploy **project** (so they share the internal network): managed **Postgres**, managed
**Redis**, a **Vault** container (internal only), and the **API** built from
[`apps/api/Dockerfile`](../apps/api/Dockerfile) and exposed over HTTPS.

The API image runs DB migrations on start (`dist/migrate.js`, the drizzle-orm runtime migrator)
and the app auto-provisions Vault's transit engine + `ed25519` signing key on first sign — so
there is **no manual DB or Vault setup**.

## Prerequisites

- A VPS running Dokploy, and a domain (or subdomain) with an A record pointing at it.
- The GitHub repo connected to Dokploy (GitHub App or a deploy key) for auto-deploy on push.

## 1. Create the project

Dokploy → **Create Project** → `accesscore`. Add all four services below inside it; Dokploy
gives same-project services an internal hostname you'll wire into the API's env.

## 2. Postgres (managed)

**Databases → Postgres 16.** Set a database name, user, and a strong password; deploy. From its page,
note the **internal** host. The owner connection string becomes `MIGRATION_DATABASE_URL` (runs DDL
migrations). Then create the least-privilege runtime role once
([ADR-018](adr/018-least-privilege-db-role.md)):

```sql
CREATE ROLE accesscore_app LOGIN PASSWORD '<strong-app-password>';
```

The app connects as that non-owner role (migration 0012 grants it the minimum and forbids
`UPDATE`/`DELETE` on the append-only `decision_log`/`revisions`):

```
MIGRATION_DATABASE_URL = postgres://<owner>:<password>@<internal-host>:5432/<database>
DATABASE_URL           = postgres://accesscore_app:<app-password>@<internal-host>:5432/<database>
```

## 3. Redis (managed)

**Databases → Redis 7.** Deploy. Build:

```
REDIS_URL = redis://:<password>@<internal-host>:6379      # or redis://<internal-host>:6379 if unauthenticated
```

## 4. Vault (dev-server mode, strong root token)

**Applications → Create → Docker Image**, image `hashicorp/vault:1.18`.

- **Environment:**
  - `VAULT_DEV_ROOT_TOKEN_ID` = a long random secret (this becomes the API's `VAULT_TOKEN`; it
    must **not** be `accesscore-dev-token` or the API's production guard refuses to boot).
  - `VAULT_DEV_LISTEN_ADDRESS` = `0.0.0.0:8200`
- **Advanced → Capabilities:** add `IPC_LOCK`.
- **No domain** — internal only. The container listens on `8200`.

Deploy. Then:

```
VAULT_ADDR  = http://<internal-host>:8200
VAULT_TOKEN = <the VAULT_DEV_ROOT_TOKEN_ID you set>
```

> Dev-server Vault is in-memory. After any Vault restart the app recreates the signing key
> automatically; the only effect is that access tokens issued before the restart stop verifying
> (they live ~15 min anyway). This is fine for a portfolio deployment. A hardened setup would run
> a **sealed, persistent** Vault (raft storage + unseal) — more operational overhead.

> **Least-privilege token (optional hardening).** The API auto-provisions the transit engine and
> signing key on first sign, which needs a privileged token — hence the root token above. For a
> stricter posture, mount `transit` and create the signing key out-of-band once, then run the API
> with a `VAULT_TOKEN` bound to a Transit-only policy (`sign`/`verify`/`rotate` on the key; no
> `sys/mounts`) so the running process is not a Vault admin.

## 5. API (from this repo, public + TLS)

**Applications → Create → GitHub**, repo `diegowritescode/accesscore`, branch `main`.

- **Build type:** Dockerfile.
- **Dockerfile path:** `apps/api/Dockerfile`.
- **Build context / path:** repository root (`.`) — the Dockerfile needs the workspace manifests.
- **Port:** `3000`.
- **Domain:** your domain/subdomain → enable **HTTPS** (Dokploy provisions Let's Encrypt via
  Traefik).
- **Auto-deploy:** enable, so a push to `main` redeploys.

### Environment

| Variable                 | Value                                         |
| ------------------------ | --------------------------------------------- |
| `NODE_ENV`               | `production`                                  |
| `PORT`                   | `3000`                                        |
| `DATABASE_URL`           | the `accesscore_app` role (step 2)            |
| `MIGRATION_DATABASE_URL` | the owner role (step 2)                       |
| `REDIS_URL`              | from step 3                                   |
| `SIGNER_DRIVER`          | `vault`                                       |
| `VAULT_ADDR`             | from step 4                                   |
| `VAULT_TOKEN`            | from step 4 (not the dev default)             |
| `VAULT_TRANSIT_KEY`      | `accesscore-signing` (optional; this default) |
| `JWT_ISSUER`             | `https://<your-domain>`                       |
| `JWT_AUDIENCE`           | `accesscore` (or your choice)                 |

The remaining knobs (`ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `JWKS_CACHE_MAX_AGE`,
`THROTTLE_*`, `JWT_CLOCK_SKEW`) have production-safe defaults — see
[`.env.example`](../.env.example). Boot-time validation **fails fast** with a clear message if
`NODE_ENV=production` and `SIGNER_DRIVER` isn't `vault` or `VAULT_TOKEN` is the dev default.

Deploy. Dokploy builds the image; the container **migrates the database, then starts** the API.

## 6. Verify

```bash
curl https://<your-domain>/health   # {"status":"ok"}
curl https://<your-domain>/ready    # {"status":"ready"} (pings Postgres)
curl https://<your-domain>/.well-known/jwks.json   # the live Ed25519 signing key
```

Then walk the PDP flow (register → verify → login → `POST /authz/check`) from
[`api.md`](api.md).

## Operational notes

- Keep `VAULT_TOKEN` in Dokploy's secret store; rotate it if leaked.
- Postgres/Redis backups are managed by Dokploy.
- Each deploy re-runs migrations (idempotent — drizzle tracks applied migrations).
- To go fully production-grade: a sealed persistent Vault (see step 4), and per-service `aud`
  scoping once downstream services call `/authz/check` (see
  [ADR-013](adr/013-cross-service-authorization-contract.md)).
