# Deploying AccessCore on a VPS (Compose + Traefik)

> **Live instance:** [auth.deviego.xyz](https://auth.deviego.xyz) and
> [console.deviego.xyz](https://console.deviego.xyz), deployed with exactly this recipe.
> Rationale: [ADR-027](adr/027-container-release-and-shared-edge-deployment.md).

Images are built by the `Release` workflow and pulled from GHCR; the host never builds. The whole
topology is [`deploy/compose.yml`](../deploy/compose.yml).

```
                      ┌──────────── edge (external network) ────────────┐
  :443 ──► Traefik ───┤                                                  │
                      │   api  (auth.*)          console  (console.*)    │
                      └────┬─────────────────────────┬──────────────────┘
                           │   internal (private)    │
                      postgres    redis    vault ◄───┘ (console ► api only)
```

## Prerequisites

- Docker with the Compose plugin, and a Traefik v3 instance on the host that owns ports 80/443 with
  a certificate resolver named `le` and the Docker provider (`exposedbydefault=false`).
- DNS `A` records for the API and console hostnames pointing at the host. If the zone is on
  Cloudflare, keep them **DNS only**: Traefik answers the HTTP-01 challenge itself.

## 1. Connect Traefik to the `edge` network (once per host)

```bash
docker network create edge
docker network connect edge <traefik-container>
```

`network connect` is live, with no restart. Also add `edge` (declared `external: true`) to the
Traefik service in its own Compose file, so the connection survives the next recreate.

## 2. Get the deployment files

```bash
sudo mkdir -p /opt/portfolio && sudo chown "$USER" /opt/portfolio
git clone https://github.com/diegowritescode/accesscore.git /opt/portfolio/accesscore
cd /opt/portfolio/accesscore/deploy
cp .env.example .env && chmod 600 .env
```

Fill `.env`: every secret from `openssl rand -hex 32`, and `ACCESSCORE_IMAGE_TAG` set to the
commit SHA of the latest successful `Release` run.

## 3. Start

```bash
docker compose pull
docker compose up -d
docker compose ps
```

On first boot Postgres creates the `accesscore_app` runtime role, the API applies migrations as
the owner, then serves as the least-privilege role. Traefik requests the certificates on the first
request to each hostname.

## 4. Seed the demo data (once)

```bash
docker compose exec api node dist/seed.js
```

Demo login: `demo@accesscore.dev` / `correct horse battery staple`.

## 5. Verify

```bash
curl https://auth.deviego.xyz/health                  # {"status":"ok"}
curl https://auth.deviego.xyz/ready                   # {"status":"ready"}
curl https://auth.deviego.xyz/.well-known/jwks.json   # the live Ed25519 key
curl -o /dev/null -w '%{http_code}\n' https://auth.deviego.xyz/metrics   # 404: not routed
```

## Release and rollback

```bash
cd /opt/portfolio/accesscore && git pull
sed -i "s/^ACCESSCORE_IMAGE_TAG=.*/ACCESSCORE_IMAGE_TAG=<sha>/" deploy/.env
cd deploy && docker compose pull && docker compose up -d
```

Rollback is the same command with the previous SHA. Migrations are forward-only; a release that
adds one is rolled back by deploying a fix forward.

## Operations

- Logs: `docker compose logs -f api` (structured JSON, correlation id per request).
- Backups: `docker compose exec postgres pg_dump -U accesscore accesscore | gzip > backup.sql.gz`.
- Vault runs in dev-server mode; a Vault restart re-provisions the signing key and invalidates
  outstanding access tokens (15-minute lifetime).
