# ADR-027: Immutable container releases behind a shared edge proxy

- **Status:** Accepted (2026-09-23)
- **Date:** 2026-09-23
- Replace the Dokploy build-on-server deployment with images built once in CI, published to GHCR
  under the commit SHA, and run by a versioned Compose file behind a Traefik instance shared with
  other stacks on the same host.

## Context

The first live instance ran on a Dokploy VPS that built each image on the server from a Git push.
That host was retired, which took the public URLs down and showed the weak points of the setup:

- **The deployment was not in the repository.** Services, networks, and environment lived in
  Dokploy's database. Rebuilding on a new host meant re-clicking the recipe in
  [`deploy-dokploy.md`](../deploy-dokploy.md) and hoping nothing had drifted.
- **What ran was not what CI tested.** The server rebuilt from source, so the image in production
  was a second build of the commit, never the artifact the pipeline verified.
- **Builds competed with production.** Compiling a pnpm workspace and a Next.js app on a small VPS
  takes minutes of CPU on the same machine that serves traffic.

The new host (2 vCPU, 8 GB) already runs an unrelated production stack fronted by Traefik v3 with
Let's Encrypt HTTP-01 certificates. Only that Traefik may bind ports 80/443.

## Decision

1. **Build once, in CI.** A `Release` workflow runs after `CI` succeeds on `main`, builds the API
   and console images from their Dockerfiles, and pushes them to GHCR tagged with the full commit
   SHA (plus a moving `latest` for convenience). The image carries
   `org.opencontainers.image.revision`, so a running container names the exact commit it came from.
2. **Deploy by tag.** [`deploy/compose.yml`](../../deploy/compose.yml) is the whole production
   topology: Postgres, Redis, Vault, API, console. The host holds only `deploy/.env` with secrets and
   `ACCESSCORE_IMAGE_TAG`. A release is `pull` + `up -d` with a new SHA; a rollback is the previous
   SHA. Compose refuses to start when the tag or a secret is missing (`${VAR:?}`) instead of
   resolving an empty value.
3. **Share the edge, not the network.** A dedicated external Docker network, `edge`, connects the
   shared Traefik to the containers it routes. Only `api` and `console` join it; Postgres, Redis,
   and Vault stay on the stack's private `internal` network, unreachable from the proxy and from
   the other stacks on the host. Routers pin `traefik.docker.network=edge`.
4. **Close what the edge does not need.** The public router excludes `/metrics`; Prometheus scrapes
   it over a private network. Every container publishes no host ports, has a memory limit, and caps
   its JSON logs, so this stack cannot starve its neighbours.
5. **Least privilege from first boot.** A Postgres init script creates the `accesscore_app` runtime
   role on a fresh volume, removing the manual `CREATE ROLE` step from the old recipe
   ([ADR-018](018-least-privilege-db-role.md)).

## Consequences

- A clean host is deployable from the repository alone: clone, fill `deploy/.env`, `up -d`. The
  runbook is [`docs/deploy-vps.md`](../deploy-vps.md).
- The image in production is byte-for-byte the one CI built and tested.
- Deploys are manual (`ssh` + two commands). Continuous deployment from CI would need an inbound
  SSH credential in GitHub; for a single host that is more exposure than it saves.
- Vault still runs in dev-server mode (in-memory). A restart rotates the signing key and
  invalidates outstanding access tokens, as before; a sealed, persistent Vault remains the named
  hardening step.
- GHCR packages start private. They are made public once so the host and anyone reproducing the
  deployment can pull without a token.

## Alternatives considered

- **Keep Dokploy on the new host.** It would bring a second reverse proxy competing with the
  existing Traefik for ports 80/443, and it keeps the topology outside the repository.
- **Join the other stack's network.** Zero changes to the shared proxy, but it would put this
  stack's API on the same network as unrelated services and their datastores.
- **Build on the server.** Simpler, but it repeats the build-drift and CPU-contention problems above.
