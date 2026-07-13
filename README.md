# AccessCore

> A self-hostable Identity & Access Management platform with a hybrid
> **ReBAC + RBAC + ABAC** authorization engine — inspired by AWS IAM's evaluation
> semantics, Google Zanzibar's relationship model, and AWS Cedar's policy language.

AccessCore is the security foundation of a larger backend portfolio: other services delegate
authentication and authorization to it through a typed SDK. It treats authorization as a
first-class engineering problem — correct, deterministic, explainable, consistent, and
auditable — not a `role === 'admin'` check bolted onto a `users` table.

> **Status — building in vertical slices.** **Slices 0–3 are shipped** (identity, password
> auth, the token platform, tenancy, and a working **PDP v1**) plus a **published client
> SDK**. Authorization decisions run end to end today: a relationship-tuple store, namespace
> `action → relation` config, a pure deterministic evaluator with `expand`, an
> orchestrated `check` with consistency tokens and a decision log, and both an in-process and
> an SDK Policy Enforcement Point. The Cedar-like ABAC policy layer, MFA, the audit hash
> chain, the admin/PAP HTTP API, and the console are **designed and planned** (see
> [Status & roadmap](#status--roadmap)). Each feature below is marked **shipped** or
> **planned** so nothing overclaims.

## Why it's not another auth tutorial

- A real **Policy Decision Point (PDP)**. A pure, total, deterministic evaluator turns
  resolved relationship facts into an explainable `Decision{effect, reasons[]}` —
  Zanzibar-style tuples, roles modeled as usersets, IAM-style **deny-by-default**, and a
  matched-tuple **derivation path** on every decision. **(shipped, v1 subset — see
  [ADR-012](docs/adr/012-pdp-evaluation-algorithm.md))**
- **Consistency tokens ("zookies").** Every authorization-relevant write advances a
  commit-ordered global revision; `check` accepts a token meaning "evaluate against data at
  least this fresh," closing Zanzibar's _new-enemy problem_. **(shipped — see
  [ADR-004](docs/adr/004-authorization-consistency-model.md))**
- **Two enforcement points, one contract.** An in-process `@RequirePermission` guard and a
  remote SDK guard share a provenance-based check contract; a downstream service physically
  cannot assert its own `subject`/`org` — the wire DTO has no such field. **(shipped — see
  [ADR-013](docs/adr/013-cross-service-authorization-contract.md))**
- **Non-exportable token signing.** Asymmetric **Ed25519** keys live in **HashiCorp Vault
  Transit**; the app signs by API call and never holds private key material. Verifiers
  enforce the JWK's declared `alg`, defeating algorithm-confusion. **(shipped — see
  [ADR-009](docs/adr/009-key-management-and-cryptography.md))**
- **Refresh-token reuse detection.** Rotation on every use; replaying a rotated token revokes
  the whole token family and fails closed. **(shipped)**
- **Fail-closed everywhere.** The evaluator never throws (unknowns → deny); a PDP/store error
  is a `503`; the SDK normalizes timeouts and transport errors into `deny`. **(shipped)**
- **Explainable ABAC conditions** (`permit`/`forbid` `when { … }`), permission boundaries,
  org guardrails, MFA step-up, and a tamper-evident audit chain. **(planned — designed in
  [ADR-002](docs/adr/002-authorization-model.md), [ADR-009](docs/adr/009-key-management-and-cryptography.md))**

Full rationale lives in **13 ADRs** under [`docs/adr/`](docs/adr/).

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

- **Identity + password auth** — `User` aggregate, **Argon2id** hashing, timing-safe compare,
  a dummy-verify path for unknown users, and anti-enumeration on register/login/reset.
- **Account lifecycle** — email verification and secure single-use, hashed, expiring password
  reset; lifecycle events revoke sessions.
- **Token platform** — asymmetric **EdDSA** JWTs with `iss`/`aud`/`exp`/`nbf` binding and
  bounded clock skew; a live **JWKS** endpoint with `kid → alg` binding and cache headers;
  short-lived access tokens carrying identity only (never authorization verdicts).
- **Sessions & revocation** — device-bound sessions; list/revoke your sessions; logout /
  logout-all; refresh **rotation + reuse detection** (family revoke); a Redis blocklist that a
  PEP guard checks after JWT verification (fail-closed, TTL-bounded for offline verifiers).
- **Tenancy** — global identity with per-organization membership; the active `org` is a
  verified token claim, and org-scoping is enforced at every authorization traversal hop.
- **PDP v1** — a Postgres relationship-tuple store with commit-ordered revisions; namespace
  definitions binding `action → required relations`; a pure evaluator (direct grants + one
  userset level, with a cycle guard) and a matching `expand`; an orchestrated `check` that
  reads at a revision, honors consistency tokens, and writes a decision log.
- **Enforcement** — `POST /authz/check` (token-derived principal) and the in-process
  `@RequirePermission` guard; a **published typed SDK** (`createClient(...).check(...)` and
  `AccessCoreModule.forRoot()` + a remote `@RequirePermission`).
- **Hardening** — `helmet` headers, per-IP rate limiting (tighter on `login`/`refresh`), a
  32 KB body limit and DTO length caps, boot-time config validation, and production guards
  that refuse the software signer and the dev Vault token.

## Architecture

Modular monolith with **Hexagonal (Ports & Adapters)** + **DDD** tactical patterns: one
deployable, four layers per module (domain / application / infrastructure / interface), with
domain logic fully decoupled from NestJS and the database — which is what lets the evaluator be
property-tested in isolation. Shipped modules: `identity`, `authn`, `authz` (the core),
`tenancy`. Planned modules/rings: `federation`, `machine`, `governance`, `admin` (the PAP).
Rationale in [ADR-001](docs/adr/001-architecture-style.md); full detail (with an "Implementation
status" block) in [`docs/architecture.md`](docs/architecture.md).

## Workspace layout

A pnpm + Turborepo workspace (one repo; not a monorepo of many products):

```
apps/
  api/          NestJS API — identity, authn, authz (PDP), tenancy      (shipped)
  console/      Next.js admin console                                    (placeholder — Slice 7)
packages/
  sdk/          @diegowritescode/accesscore-sdk — typed client + NestJS PEP  (shipped)
  contracts/    shared wire DTOs (Decision, ResourceRef, reason codes)   (shipped)
  policy-engine/ reserved stub for a future extractable evaluator        (stub — see ADR-011/013)
docs/           business context, architecture, data model, security, testing, ADRs
```

The v1 PDP evaluator lives in `apps/api/src/authz/domain`; `packages/policy-engine` stays an
empty stub until the SDK needs offline/edge evaluation (the documented extraction trigger in
[ADR-011](docs/adr/011-pdp-core-location.md)/[ADR-013](docs/adr/013-cross-service-authorization-contract.md)).

## Tech stack

Node.js 22 · TypeScript · NestJS 11 · **Drizzle ORM** · PostgreSQL 16 · Redis 7 ·
**HashiCorp Vault 1.18** (Transit) · Next.js _(planned)_ · pnpm + Turborepo · Jest · `fast-check` ·
`nyc` · GitHub Actions · Docker.

## Data model

Domain-first: pure aggregates and value objects (`Email`, `PasswordHash`, `ResourceRef`,
`Action`, `Revision`, …) mapped to rows by hand-written Drizzle adapters. Core aggregates today:
`User` (global identity), `Session` / `TokenFamily` / `RefreshToken`, `Organization` /
`Membership`, and the authz core — `RelationTuple`, `NamespaceDefinition`, `DecisionLog` — plus
a `revisions` changelog backing consistency tokens. Detail and the ERD in
[`docs/data-model.md`](docs/data-model.md).

## Security

Security is the product. Enforced today: Argon2id + timing-safe compare + dummy verify;
anti-enumeration; asymmetric token signatures over a published JWKS with `iss`/`aud`/`exp`/`nbf`
binding; refresh reuse detection; a TTL-bounded revocation blocklist; per-IP rate limiting;
`helmet`; body/DTO caps; fail-fast production config guards; non-exportable Vault Transit
signing; and object-level authorization via the PDP (IDOR/BOLA prevention). Designed and
scheduled: ABAC conditions and `forbid`s, permission boundaries, MFA step-up, per-account
lockout, and the tamper-evident audit hash chain. The threat model (STRIDE, token defenses,
standards alignment, and an honest "Implementation status") is in
[`docs/security.md`](docs/security.md); vulnerabilities go through [`SECURITY.md`](SECURITY.md).

## Testing strategy

A three-layer pyramid, all determinism-first (the `Clock` is an injected port — no wall-clock
sleeps):

- **Unit** (`jest`) — pure domain + application logic with injected fakes; the bulk of the
  assertions, including **property-based** tests (`fast-check`) of the evaluator (totality,
  deny-by-default, determinism, tenant isolation, cycle safety, check/expand agreement).
- **Integration** — adapters against **real** Postgres / Redis / Vault via docker-compose
  (DB constraints, row-level concurrency, Vault Transit signing + rotation, Redis TTLs).
- **E2E** — full HTTP flows through the booted Nest app: blocklisted-but-valid JWT rejected,
  reuse cascade, the `@RequirePermission` deny/permit path, and the `/authz/check` semantics.

Coverage is collected from all three suites and **merged** (`nyc`), so an adapter exercised
only by integration/e2e still counts. The current merged figures on core logic are roughly
**~95% lines · ~94.8% statements · ~90.4% functions · ~85.9% branches**, above the CI gate
floor (`lines 90 / statements 90 / functions 85 / branches 75`, a ratchet that only rises).
Suite sizes today: **158 unit + 37 integration + 37 e2e** (API) and **11** SDK tests. Detail in
[`docs/testing-strategy.md`](docs/testing-strategy.md).

## Deployment

`docker compose up` boots Postgres 16, Redis 7, and Vault 1.18 from a clean clone; migrations
run via `pnpm --filter @accesscore/api db:migrate`; config is validated at boot and production
refuses the software signer and the dev Vault token. **AccessCore is not yet deployed to a
public URL** — a public deployment (VPS + Nginx + TLS, a persistent non-dev Vault, secret
management) is a pending portfolio deliverable. What runs locally, and exactly what is required
to go live, is in [`docs/deployment.md`](docs/deployment.md).

## Trade-offs

The significant decisions and the costs accepted (modular monolith vs microservices, Drizzle vs
TypeORM, the throughput-bounded advisory-lock revision, the synchronous v1 decision log, the
one-userset-level evaluator, token-forwarding vs on-behalf-of, Vault Transit signing) are
consolidated in [`docs/trade-offs.md`](docs/trade-offs.md), each pointing at the ADR that owns
it.

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
| 4     | PDP v2 — userset rewrites (`computed_userset` / `tuple_to_userset`), nested-group recursion, `batchCheck`                                      | Planned     |
| 5     | PDP v3 (ABAC) — Cedar-like policy DSL, conditions, explicit `forbid`s, permission boundaries, org guardrails, simulate/shadow                  | Planned     |
| 6     | Account security & audit — MFA (TOTP) + step-up, per-account lockout, tamper-evident hash-chained audit                                        | Planned     |
| 7     | Admin console (Next.js) — Users/Sessions, RBAC editor, Authorization Playground, Audit verifier                                                | Planned     |
| Rings | Passkeys · RFC 8693 token exchange · service accounts · full OIDC provider + federation + SCIM · access analyzer/reviews/SoD · HA              | Planned     |

_(Consistency tokens and `expand` already shipped in v1; Slice 4 is the remaining ReBAC depth.)_

## Quick start

```bash
corepack enable                 # or ensure pnpm 9.x is installed
pnpm install
cp .env.example .env
docker compose up -d            # Postgres 16, Redis 7, Vault 1.18 (dev mode)
pnpm --filter @accesscore/api db:migrate
pnpm --filter @accesscore/api dev   # NestJS API in watch mode on :3000
```

Health: `GET /health` (liveness), `GET /ready` (readiness — pings Postgres).

Development commands:

```bash
pnpm lint        # ESLint across the workspace
pnpm typecheck   # tsc --noEmit
pnpm test        # unit tests
pnpm build       # build all packages/apps
pnpm --filter @accesscore/api coverage   # merged unit+integration+e2e coverage + gate
```

Contribution conventions and quality gates are in [`CONTRIBUTING.md`](CONTRIBUTING.md);
community expectations in [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Demo — the PDP over HTTP

There is no screenshot yet: the visual **Authorization Playground** ships with the console in
Slice 7. Until then the flow is exercisable with `curl`. The parts reachable **over HTTP today**
are register → verify → login → `POST /authz/check`; authoring the authorization graph (org
membership, namespace configs, relationship tuples) currently goes through the module's internal
application writers, because the **admin/PAP HTTP API is planned, not shipped**. So a bare-curl
call returns a `deny` for a principal with no grants — which is the honest, correct default.

```bash
API=http://localhost:3000

# 1. Register (202 Accepted; a verification email is "queued" — in dev the LogMailer only logs it)
curl -sS -X POST "$API/auth/register" \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"correct horse staple"}'
# -> {"status":"accepted"}

# 2. Verify email. In dev there is no real inbox and the token is not printed; read it from the
#    DB (or, as the e2e tests do, activate the user directly) until an email transport lands:
#    docker compose exec postgres psql -U accesscore -d accesscore \
#      -c "UPDATE users SET status='active', email_verified_at=now() WHERE email='demo@example.com';"
# (With a real token you would instead: curl -X POST "$API/auth/verify-email" -d '{"token":"<raw>"}')

# 3. Log in -> access + refresh tokens
TOKEN=$(curl -sS -X POST "$API/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"correct horse staple"}' | jq -r .access_token)

# 4. Ask the PDP. With no org membership / tuples yet, the honest answer is a deny.
curl -sS -X POST "$API/authz/check" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"action":"document.read","resource":{"type":"document","id":"doc-1"}}'
# -> {"effect":"deny","reasons":[{"code":"no_org_context","message":"..."}]}
#    (or {"code":"default_deny"} once the caller is in an org but holds no matching relation)
```

Reaching a **`permit`** requires an org, a namespace, and a relationship tuple. Those are created
through the internal writers (`TenancyService.provisionPersonalOrganization`,
`NamespaceConfigWriter.define`, `RelationTupleWriter.write`) — the full end-to-end permit path is
proven by `apps/api/test/require-permission.e2e-spec.ts`:

```ts
await tenancy.provisionPersonalOrganization(userId);
await configWriter.define({
  orgId,
  namespace: 'document',
  config: { relations: ['viewer'], actions: { read: ['viewer'] } },
});
await tupleWriter.write({
  orgId,
  object: { type: 'document', id: 'doc-1' },
  relation: 'viewer',
  subject: { kind: 'subject', ref: { type: 'user', id: userId.value } },
});
// now check(document.read, document:doc-1) -> { effect: 'permit', reasons: [{ code: 'grant.direct', ... }] }
```

See [`docs/api.md`](docs/api.md) for the full HTTP surface, request/response shapes, and SDK usage.

## License

[Apache-2.0](LICENSE).
