# AccessCore

> A self-hostable Identity & Access Management platform with a hybrid
> **ReBAC + RBAC + ABAC** authorization engine — inspired by AWS IAM's evaluation
> semantics, Google Zanzibar's relationship model, and AWS Cedar's policy language.

AccessCore is the security foundation of a larger backend portfolio: other services delegate
authentication and authorization to it through a typed SDK. It treats authorization as a
first-class engineering problem — correct, deterministic, explainable, consistent, and
auditable — not a `role === 'admin'` check bolted onto a `users` table.

> **Live:** API at **[auth.deviego.xyz](https://auth.deviego.xyz)** — try `GET /health`,
> [`GET /.well-known/jwks.json`](https://auth.deviego.xyz/.well-known/jwks.json), the interactive
> [`/reference`](https://auth.deviego.xyz/reference), or `POST /authz/check` (see
> [`docs/api.md`](docs/api.md)). Admin console at **[console.deviego.xyz](https://console.deviego.xyz)**.
> Both self-hosted on a Dokploy VPS.

> **Status — the hybrid engine is complete.** **Slices 0–8 are shipped.** Identity and password
> auth, the EdDSA token platform, tenancy, and the full **policy decision point** —
> **ReBAC** (Zanzibar-style tuples with `computed_userset` / `tuple_to_userset` rewrites and
> nested groups), **RBAC** (roles modeled as usersets), and **ABAC** (a Cedar-like condition
> language with `forbid` deny-override, permission boundaries, and org guardrails) — resolved in
> one call with consistency tokens, a decision log, and an explainable derivation path.
> **Account security** (TOTP MFA + step-up/AAL elevation, per-account/per-IP lockout, a
> tamper-evident audit hash chain), a **Next.js admin console** (read + write + Playground +
> account security, EN/ES), a **published client SDK**, and a **Prometheus observability floor**
> are all live. Remaining work is concentric **rings** (passkeys, OIDC/federation, SCIM, access
> analyzer, HA) — see [Status & roadmap](#status--roadmap).

## Why it's not another auth tutorial

- A real **Policy Decision Point (PDP)**. A pure, total, deterministic evaluator turns resolved
  relationship facts and attribute conditions into an explainable `Decision{effect, reasons[]}` —
  Zanzibar-style tuples, roles modeled as usersets, ABAC conditions, IAM-style **deny-by-default**
  with **`forbid` deny-override**, and a matched-tuple **derivation path** on every decision.
  **(shipped — see [ADR-012](docs/adr/012-pdp-evaluation-algorithm.md),
  [ADR-015](docs/adr/015-userset-rewrites-and-rebac-evaluation.md),
  [ADR-016](docs/adr/016-abac-policy-and-deny-override.md))**
- **Userset rewrites & nested groups.** `computed_userset` (role aliasing) and `tuple_to_userset`
  (hierarchy/inheritance) resolve through a bounded recursive walk with a cycle guard, modeled as
  a `Userset` operator tree that made ABAC purely additive. **(shipped)**
- **Consistency tokens ("zookies").** Every authorization-relevant write advances a commit-ordered
  global revision; `check` accepts a token meaning "evaluate against data at least this fresh,"
  closing Zanzibar's _new-enemy problem_. **(shipped — see
  [ADR-004](docs/adr/004-authorization-consistency-model.md))**
- **Two enforcement points, one contract.** An in-process `@RequirePermission` guard and a remote
  SDK guard share a provenance-based check contract; a downstream service physically cannot assert
  its own `subject`/`org` — the wire DTO has no such field. **(shipped — see
  [ADR-013](docs/adr/013-cross-service-authorization-contract.md))**
- **Non-exportable token signing.** Asymmetric **Ed25519** keys live in **HashiCorp Vault
  Transit**; the app signs by API call and never holds private key material. Verifiers enforce the
  JWK's declared `alg`, defeating algorithm-confusion. **(shipped — see
  [ADR-009](docs/adr/009-key-management-and-cryptography.md))**
- **MFA + step-up + tamper-evident audit.** TOTP enrollment with single-use recovery codes;
  step-up elevates the session to **AAL 2**, which ABAC policies can require; security events are
  appended to a **SHA-256 hash chain** whose integrity anyone can re-verify. **(shipped — see
  [ADR-020](docs/adr/020-mfa-and-step-up.md), [ADR-021](docs/adr/021-tamper-evident-audit.md))**
- **Fail-closed everywhere.** The evaluator never throws (unknowns → deny); a `forbid` or a
  truncated negative operand never fails open; a PDP/store error is a `503`; the SDK normalizes
  timeouts and transport errors into `deny`. **(shipped)**

Full rationale lives in **22 ADRs** under [`docs/adr/`](docs/adr/).

## Business problem

Most applications reinvent auth badly and it collapses under real requirements: resource-level
permissions a role enum can't express, relationship-based sharing, conditional access
(MFA / IP / time), safe delegated administration in multi-tenant systems, and access that is
auditable, provable, and revocable. AccessCore unifies the three dominant models — AWS IAM
(deterministic deny-override), Google Zanzibar (ReBAC at scale), and AWS Cedar (analyzable
policy) — into one engine, so the rest of the portfolio's services get one hardened identity
layer instead of re-implementing auth per service. Full context in
[`docs/business-context.md`](docs/business-context.md).

## What works today (shipped)

- **Identity + password auth** — `User` aggregate, **Argon2id** hashing, timing-safe compare, a
  dummy-verify path for unknown users, and anti-enumeration on register/login/reset.
- **Account lifecycle** — email verification and secure single-use, hashed, expiring password
  reset; lifecycle events revoke sessions.
- **Token platform** — asymmetric **EdDSA** JWTs with `iss`/`aud`/`exp`/`nbf` binding and bounded
  clock skew; a live **JWKS** endpoint with `kid → alg` binding and cache headers; short-lived
  access tokens carrying identity + assurance level (never authorization verdicts).
- **Sessions & revocation** — device-bound sessions; list/revoke your sessions; logout /
  logout-all; refresh **rotation + reuse detection** (family revoke); a Redis blocklist checked by
  a PEP guard after JWT verification (fail-closed, TTL-bounded for offline verifiers).
- **Tenancy** — global identity with per-organization membership; the active `org` is a verified
  token claim, and org-scoping is enforced at every authorization traversal hop.
- **PDP — the hybrid engine** — a Postgres relationship-tuple store with commit-ordered revisions;
  rewrite-aware namespace definitions (`this` / `computed_userset` / `tuple_to_userset` / `union` /
  `intersection` / `exclusion`); a pure evaluator resolving direct grants, role aliases, hierarchy,
  and bounded nested groups; **ABAC** conditions over principal/environment attributes with
  `forbid` **deny-override**, permission boundaries and org guardrails; `check`, `expand`,
  shared-snapshot `batchCheck`, and `simulate` (live-vs-overlay diff) — all reading at a revision,
  honoring consistency tokens, and writing a decision log.
- **Enforcement** — `POST /authz/check` / `batch-check` / `expand` / `simulate` (token-derived
  principal) and the in-process `@RequirePermission` guard; a **published typed SDK**
  (`createClient(...).check(...)` and `AccessCoreModule.forRoot()` + a remote `@RequirePermission`).
- **Policy administration (PAP)** — owner-gated `PUT /authz/namespaces/:ns`,
  `POST`/`DELETE /authz/tuples`, and `PUT`/`DELETE /authz/policies/:id`, condition-validated at
  write time; plus owner-gated read/discovery endpoints.
- **Account security** — TOTP MFA (enroll → activate → single-use recovery codes → disable),
  **step-up** to AAL 2, per-account/per-IP/per-MFA **lockout** (Redis, atomic), and a
  **tamper-evident audit hash chain** with an owner-gated `GET /authz/audit/verify`.
- **Admin console** (Next.js) — a token-safe backend-for-frontend (httpOnly cookie, never exposed
  to the browser): dashboard, schema/relationships/policies **read and write** screens, an
  Authorization **Playground** (`check` / `expand` / `simulate` with a condition builder), account
  security (MFA + audit verifier), and an **EN/ES** toggle.
- **Observability** — a Prometheus `GET /metrics` floor: process/runtime metrics, per-route HTTP
  latency, and **authz-domain** metrics (`authz_decisions_total{effect}`, PDP latency); structured
  pino logs with correlation IDs.
- **Hardening** — `helmet` headers, per-IP rate limiting (tighter on `login`/`refresh`), a 32 KB
  body limit and DTO length caps, boot-time config validation, production guards that refuse the
  software signer and the dev Vault token, and a **least-privilege runtime DB role** with
  `REVOKE UPDATE, DELETE` on the append-only decision log / revisions / audit tables.

## Architecture

Modular monolith with **Hexagonal (Ports & Adapters)** + **DDD** tactical patterns: one
deployable, four layers per module (domain / application / infrastructure / interface), with
domain logic fully decoupled from NestJS and the database — which is what lets the evaluator be
property-tested in isolation. Modules: `identity`, `authn`, `authz` (the core PDP + PAP),
`tenancy`, `security` (MFA + audit chain), `observability` (metrics). Rationale in
[ADR-001](docs/adr/001-architecture-style.md); full detail in
[`docs/architecture.md`](docs/architecture.md).

## Workspace layout

A pnpm + Turborepo workspace (one repo; not a monorepo of many products):

```
apps/
  api/          NestJS API — identity, authn, authz (PDP+PAP), tenancy, security, observability
  console/      Next.js admin console — read/write screens, Playground, account security, EN/ES
packages/
  sdk/          @diegowritescode/accesscore-sdk — typed client + NestJS PEP
  contracts/    shared wire DTOs (Decision, ResourceRef, reason codes)
  policy-engine/ reserved stub for a future extractable evaluator (see ADR-011/013)
docs/           business context, architecture, data model, security, testing, observability, ADRs
```

The PDP evaluator lives in `apps/api/src/authz/domain`; `packages/policy-engine` stays an empty
stub until the SDK needs offline/edge evaluation (the documented extraction trigger in
[ADR-011](docs/adr/011-pdp-core-location.md)/[ADR-013](docs/adr/013-cross-service-authorization-contract.md)).

## Tech stack

Node.js 22 · TypeScript · NestJS 11 · **Drizzle ORM** · PostgreSQL 16 · Redis 7 ·
**HashiCorp Vault 1.18** (Transit) · **Next.js 15** · `prom-client` · pnpm + Turborepo · Jest ·
`fast-check` · `nyc` · GitHub Actions · Docker.

## Data model

Domain-first: pure aggregates and value objects (`Email`, `PasswordHash`, `EntityRef`, `Action`,
`Userset`, `Condition`, `Revision`, …) mapped to rows by hand-written Drizzle adapters. Core
aggregates: `User` (global identity), `Session` / `TokenFamily` / `RefreshToken`, `Organization` /
`Membership`, `MfaCredential` / `RecoveryCode`, and the authz core — `RelationTuple`,
`NamespaceDefinition`, `Policy`, `DecisionLog`, the tamper-evident `security_audit` chain — plus a
`revisions` changelog backing consistency tokens. Detail and the ERD in
[`docs/data-model.md`](docs/data-model.md).

## Security

Security is the product. Enforced today: Argon2id + timing-safe compare + dummy verify;
anti-enumeration; asymmetric token signatures over a published JWKS with `iss`/`aud`/`exp`/`nbf`
binding; refresh reuse detection; a TTL-bounded revocation blocklist; per-IP rate limiting and
per-account/per-IP lockout; `helmet`; body/DTO caps; fail-fast production config guards;
non-exportable Vault Transit signing; object-level authorization via the PDP (IDOR/BOLA
prevention); ABAC conditions and `forbid` deny-override; TOTP **MFA + step-up**; a least-privilege
runtime DB role; and a **tamper-evident audit hash chain** (SHA-256, advisory-lock-serialized,
re-verifiable). The threat model (STRIDE, token defenses, standards alignment) is in
[`docs/security.md`](docs/security.md); vulnerabilities go through [`SECURITY.md`](SECURITY.md).

## Testing strategy

A three-layer pyramid, all determinism-first (the `Clock` is an injected port — no wall-clock
sleeps):

- **Unit** (`jest`) — pure domain + application logic with injected fakes; the bulk of the
  assertions, including **property-based** tests (`fast-check`) of the evaluator (totality,
  deny-by-default, determinism, tenant isolation, cycle safety, check/expand agreement, and the
  fail-closed asymmetry of `forbid`/condition evaluation).
- **Integration** — adapters against **real** Postgres / Redis / Vault via docker-compose (DB
  constraints, row-level concurrency, Vault Transit signing + rotation, Redis TTLs, the
  advisory-locked audit chain, the least-privilege role's `REVOKE`s).
- **E2E** — full HTTP flows through the booted Nest app: blocklisted-but-valid JWT rejected, reuse
  cascade, `@RequirePermission` deny/permit, the `/authz/*` semantics, MFA + step-up, lockout, the
  audit verifier, and the Prometheus `/metrics` surface.

Coverage is collected from all three suites and **merged** (`nyc`), so an adapter exercised only by
integration/e2e still counts. Current merged figures on core logic: roughly **~95.7% lines ·
~95.2% statements · ~92.9% functions · ~85.9% branches**, above the CI gate floor
(`lines 90 / statements 90 / functions 85 / branches 75`, a ratchet that only rises). Suite sizes:
**370 unit + 63 integration + 69 e2e** (API) and **14** SDK tests. Detail in
[`docs/testing-strategy.md`](docs/testing-strategy.md).

## Deployment

`docker compose up` boots Postgres 16, Redis 7, and Vault 1.18 from a clean clone; migrations run
via `pnpm --filter @accesscore/api db:migrate`; config is validated at boot and production refuses
the software signer and the dev Vault token. **The API is deployed at
[auth.deviego.xyz](https://auth.deviego.xyz) and the console at
[console.deviego.xyz](https://console.deviego.xyz)** — a self-hosted [Dokploy](https://dokploy.com)
VPS with managed Postgres + Redis, a Vault container, and images built from
[`apps/api/Dockerfile`](apps/api/Dockerfile) behind Let's Encrypt TLS. The step-by-step recipe is
[`docs/deploy-dokploy.md`](docs/deploy-dokploy.md); the deployment model, `/metrics` scraping, and
local setup are in [`docs/deployment.md`](docs/deployment.md) and
[`docs/observability.md`](docs/observability.md).

## Trade-offs

The significant decisions and the costs accepted (modular monolith vs microservices, Drizzle vs
TypeORM, the throughput-bounded advisory-lock revision, the synchronous decision log, the
bounded-depth evaluator, the operator-tree rewrite model, session-owned AAL, an open `/metrics`
scrape target, token-forwarding vs on-behalf-of, Vault Transit signing) are consolidated in
[`docs/trade-offs.md`](docs/trade-offs.md), each pointing at the ADR that owns it.

## Status & roadmap

Capabilities land as **vertical slices** (each end-to-end: domain → API → tests → CI), then
concentric **rings** in value order. Deferring a ring is a decision, not an omission
([`docs/scope-and-roadmap.md`](docs/scope-and-roadmap.md)).

| Slice | Scope                                                                                                                                          | Status      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 0     | Walking skeleton — health/readiness, config validation, first migration, docker-compose, CI                                                    | **Shipped** |
| 1     | Identity + password auth — `User`, Argon2id, register/verify/reset, anti-enumeration                                                           | **Shipped** |
| 2     | Token platform — EdDSA JWT + JWKS + rotation, refresh reuse detection, sessions, revocation                                                    | **Shipped** |
| 2.5   | Tenancy + hardening — orgs/membership, throttling, `helmet`, prod config guards, Vault Transit                                                 | **Shipped** |
| 3     | PDP v1 + SDK — tuple store, namespace config, pure evaluator + `expand`, `check` + zookies + decision log, `@RequirePermission`, published SDK | **Shipped** |
| 4     | PDP v2 (ReBAC) — userset rewrites (`computed_userset` / `tuple_to_userset`), nested-group recursion, shared-snapshot `batchCheck`              | **Shipped** |
| 5     | PDP v3 (ABAC) — Cedar-like condition DSL, `forbid` deny-override, permission boundaries, org guardrails, `simulate`                            | **Shipped** |
| 6     | Account security & audit — TOTP MFA + step-up (AAL 2), per-account/per-IP lockout, tamper-evident audit hash chain                             | **Shipped** |
| 7     | Admin console (Next.js) — read + write screens (schema/relationships/policies), Authorization Playground, account security, EN/ES              | **Shipped** |
| 8     | Observability & ops floor — Prometheus `/metrics` (HTTP + authz-domain), least-privilege DB role, structured pino logging                      | **Shipped** |
| Rings | Passkeys · RFC 8693 token exchange · service accounts · full OIDC provider + federation + SCIM · access analyzer/reviews/SoD · HA              | Planned     |

## Quick start

```bash
corepack enable                 # or ensure pnpm 9.x is installed
pnpm install
cp apps/api/.env.example apps/api/.env   # the API loads this at startup
docker compose up -d            # Postgres 16, Redis 7, Vault 1.18 (dev mode)
pnpm --filter @accesscore/api db:migrate
pnpm --filter @accesscore/api seed  # optional: a demo authorization graph to explore (see Demo)
pnpm --filter @accesscore/api dev   # NestJS API in watch mode on :3000
pnpm --filter @accesscore/console dev   # Next.js console on :3001 (optional)
```

Health: `GET /health` (liveness), `GET /ready` (readiness — pings Postgres). Interactive API
reference (Scalar, rendered from the OpenAPI document): `GET /reference`. Prometheus metrics:
`GET /metrics`.

Development commands:

```bash
pnpm lint        # ESLint across the workspace
pnpm typecheck   # tsc --noEmit
pnpm test        # unit tests
pnpm build       # build all packages/apps
pnpm --filter @accesscore/api coverage   # merged unit+integration+e2e coverage + gate
```

Contribution conventions and quality gates are in [`CONTRIBUTING.md`](CONTRIBUTING.md); community
expectations in [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Demo — the hybrid engine over HTTP

`pnpm --filter @accesscore/api seed` provisions a demo org, a `document` namespace with **userset
rewrites**, and a relationship graph that exercises all three ReBAC mechanisms, then prints a demo
login. It is idempotent, so it is safe to re-run.

The seeded graph on `document:onboarding` — one document reachable three different ways:

- **role aliasing** — the demo user is the `owner`; the namespace rewrites `owner ⇒ editor ⇒ viewer`
  (`computed_userset`), so the owner can `read` without a direct `viewer` tuple.
- **nested groups** — `user:bob` ∈ `group:eng-leads` ∈ `group:eng`, and `group:eng` is a `viewer` of
  the document — resolved across two userset levels.
- **hierarchy** — the document's `parent` is `folder:handbook`, and `user:carol` is a `viewer` of
  that folder, so she inherits view on the document (`tuple_to_userset`).

```bash
API=http://localhost:3000                       # or the live deploy
pnpm --filter @accesscore/api seed              # local only; prints the demo credentials

TOKEN=$(curl -sS -X POST "$API/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"demo@accesscore.dev","password":"correct horse battery staple"}' | jq -r .access_token)

# check: the owner can read — resolved through owner -> editor -> viewer
curl -sS -X POST "$API/authz/check" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"action":"document.read","resource":{"type":"document","id":"onboarding"}}'
# -> {"effect":"permit","reasons":[{"code":"grant.computed_userset",
#      "message":"Subject user:<you> holds viewer on document:onboarding."}]}

# expand: who can view this document, resolved across every rewrite?
curl -sS -X POST "$API/authz/expand" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"resource":{"type":"document","id":"onboarding"},"relation":"viewer"}'
# -> {"subjects":[
#      {"type":"user","id":"bob"},        # nested groups: eng-leads < eng < document viewer
#      {"type":"user","id":"<you>"},      # role aliasing: owner -> editor -> viewer
#      {"type":"user","id":"carol"}       # hierarchy: folder:handbook viewer -> document viewer
#    ]}
```

Every `permit` carries its **derivation**: `reasons[].code` names the mechanism (`grant.direct` /
`grant.userset` / `grant.computed_userset` / `grant.tuple_to_userset`) and, on a `check`,
`reasons[].path` is the exact chain of tuples that granted it — the explainability that feeds the
decision log and the Authorization Playground.

Author the graph and policies yourself over HTTP through the owner-gated **Policy Administration
Point** (`PUT /authz/namespaces/:ns`, `POST`/`DELETE /authz/tuples`,
`PUT`/`DELETE /authz/policies/:id`, [ADR-014](docs/adr/014-policy-administration-point.md)) — or
through the **[admin console](https://console.deviego.xyz)** — and query it with
`POST /authz/check`, `/authz/expand`, `/authz/batch-check`, and `/authz/simulate`. Add an ABAC
`forbid` that requires `principal.aal >= 2` and watch a `check` flip to `deny` until you step up
your session with MFA. See [`docs/api.md`](docs/api.md) for the full surface and SDK usage.

## License

[Apache-2.0](LICENSE).
