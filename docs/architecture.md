# AccessCore — Architecture

## Architectural style

Modular monolith with **Hexagonal / Ports & Adapters** and **DDD tactical patterns**. One
deployable, strong internal module boundaries, domain logic fully decoupled from NestJS and
the database. Rationale: [ADR-001](adr/001-architecture-style.md).

Layers (per module):

- **Domain** — entities, aggregates, value objects, domain services, domain events. Zero
  framework/ORM imports. Pure and unit-testable.
- **Application** — use cases (commands/queries), orchestration, transactions, and **ports**
  (interfaces) for everything external.
- **Infrastructure** — adapters implementing ports: persistence (ORM), crypto, token
  signing, email, cache, outbox, external IdPs.
- **Interface** — NestJS controllers (REST + OIDC endpoints), guards (PEP), admin API, the
  SDK contract.

## System context

AccessCore is both an **authentication provider** (issues/validates tokens, OIDC) and an
**authorization service** (a Policy Decision Point). Consumers — spine services, the admin
console, and machines — talk to it over REST/OIDC and via a typed SDK.

## Bounded contexts (modules)

- **identity** — users, profiles, credential lifecycle. Aggregate: `User`.
- **authn** — login, sessions, tokens (JWT/JWKS), MFA, passkeys, password reset, email
  verification. Aggregates: `Session`/`TokenFamily`, `MfaEnrollment`.
- **authz** — the decision engine (PDP): policies, roles, permissions, relationship tuples,
  conditions, decision logs. **The core.** Aggregates: `Policy`, `RoleDefinition`, `RelationTuple`.
- **tenancy** — organizations, membership, tenant scoping. Aggregate: `Organization`.
- **federation** _(ring)_ — OIDC provider endpoints, external IdP (OIDC/SAML) relying party, SCIM.
- **machine** _(ring)_ — service accounts, API keys, workload identity federation, assume-role.
- **governance** _(ring)_ — tamper-evident audit, decision logs, access analyzer, access reviews, SoD.
- **admin** — the administration API (PAP) backing the console.

Cross-cutting: transactional **outbox** + domain events, observability (OTel), config
validation, crypto/key management.

## The authorization engine (the heart)

Enterprise decomposition (XACML vocabulary):

- **PDP — Policy Decision Point:** the pure decision function
  `check(principal, action, resource, context) → Decision`, plus `expand(resource, relation)`
  (who has access) and `batchCheck`. Deterministic; heavily tested, including property-based.
- **PEP — Policy Enforcement Point:** NestJS guards + the SDK in consumer services; they
  _ask_ the PDP and enforce the verdict.
- **PAP — Policy Administration Point:** the admin API/console to author policies, roles, tuples.
- **PIP — Policy Information Point:** context providers feeding conditions (MFA state, IP,
  time, principal/resource attributes).

**Unified hybrid model** (see [ADR-002](adr/002-authorization-model.md)):

- **ReBAC** — relationship tuples `resource#relation@subject` with namespace definitions and
  userset rewrites (a Zanzibar subset). Handles sharing and hierarchy.
- **RBAC** — roles are usersets (`role:admin#member@user:x`), so RBAC is a _special case_ of ReBAC.
- **ABAC** — Cedar-like policies (`permit(principal, action, resource) when { … }`) add
  conditions over context/attributes.
- **Evaluation (IAM-style, deterministic):** default-deny → gather applicable permits/forbids
  → **explicit forbid wins** → the result must also satisfy any **permission boundary** and
  **tenant/org guardrail**. Ordered, documented, testable.
- **Consistency:** relationship reads support consistency tokens ("zookies") to avoid the
  new-enemy problem ([ADR-004](adr/004-authorization-consistency-model.md)).
- **Decision logs:** every decision persists inputs + matched rules + derivation → feeds
  audit and the access analyzer.

## Authentication & tokens

See [ADR-003](adr/003-token-and-session-strategy.md).

- **Asymmetric signing** — non-exportable **Ed25519** keys in **HashiCorp Vault Transit**
  ([ADR-009](adr/009-key-management-and-cryptography.md); ES256 the portable fallback for KMS
  lacking EdDSA) behind a `Signer` port, a **JWKS** endpoint publishing each key version as an
  `OKP`/`Ed25519` JWK with a `kid`→`alg` binding, and scheduled rotation.
- Short-lived **access tokens** (stateless, minimal claims — they carry identity, _not_
  authorization verdicts; authz is decided by the PDP at the PEP or via explicitly scoped tokens).
- **Refresh tokens:** rotation on every use + **reuse detection** → reusing a rotated token
  revokes the whole **token family** (theft detection). Immediate revocation via Redis.
- **Sessions** bound to devices; logout-all; **step-up** (a policy condition may require
  `aal ≥ 2` / recent MFA).
- **MFA:** TOTP + recovery codes (core); WebAuthn/passkeys (ring).
- **Downscoped tokens:** assume-role / token exchange (RFC 8693) for delegation and machine
  identity (ring).

## Persistence

PostgreSQL. The domain is decoupled via repository ports; the ORM is an infrastructure
adapter (ORM choice: ADR pending). The **relationship tuple store** is an indexed table with
a revision/changelog enabling consistency tokens. Real migrations (no `synchronize`); DB
constraints enforce invariants (e.g. unique email per tenant). Redis for token revocation,
rate limiting, and decision caching (invalidated on policy/tuple change).

## Cross-cutting

- **Domain events + transactional outbox** — `UserRegistered`, `LoginFailed`,
  `RefreshTokenReused`, `RoleAssigned`, `PolicyChanged`, `AccessRevoked`, … Published
  reliably; this is the integration seam to EventBridge (spine phase 3).
- **Observability** — OpenTelemetry traces on every decision; metrics (decision latency,
  allow/deny rate, cache hit ratio); structured logs + correlation IDs.
- **Config** — validated at boot (fail fast).

## Critical flows (with failure modes)

1. **Login** → verify credentials (timing-safe, anti-enumeration) → issue access + refresh
   (new token family) → emit events. _Failure:_ lockout after N attempts (per-account +
   per-IP); fail-closed.
2. **Authorization check** → PEP calls `check()` → PDP gathers relevant tuples/policies →
   evaluates conditions via PIP context → deny-override → returns Decision + reasons →
   logged. _Failure:_ PDP unavailable/uncertain → **fail closed** (deny).
3. **Refresh** → validate token → if already-rotated (reused) → **revoke family + alert**
   (theft) → else rotate and issue new pair.
4. **Revocation** → policy/tuple change → outbox event → cache invalidation → later checks
   reflect it within the consistency guarantee.

## Non-functional / robustness targets

- PDP decision p99 < ~5ms (cached); fail-closed; no single point of failure.
- Deterministic evaluator with **property-based tests** proving invariants (deny-override,
  boundary containment).
- **Simulation & shadow-mode** for policy changes before enforcement.
- ~85%+ coverage on core logic; k6 load tests on the PDP (ring).

## Scope

Committed robust core vs concentric rings — see [scope-and-roadmap.md](scope-and-roadmap.md).

## Post-review hardening (2026-07-11)

Adversarial architecture + security reviews refined the design; the deltas now live across the
ADRs:

- **PDP input provenance** ([ADR-008](adr/008-pdp-trust-model.md)) — identity from the verified
  token, environment server-observed, resource facts from tuples; caller attributes never grant.
- **Consistency** ([ADR-004](adr/004-authorization-consistency-model.md)) — commit-ordered
  revisions via an advisory-locked changelog (not a sequence); zookie stored on the resource;
  context-dependent decisions not cached by relation alone.
- **Tenancy** ([ADR-007](adr/007-tenancy-model.md)) — global identity + per-org membership;
  `orgId` enforced at every traversal hop.
- **UnitOfWork port** — Drizzle's `tx` never leaks into application ports; **async decision
  logging** off the hot path; an explicit **credential port** between `identity` and `authn`.
- **Keys** ([ADR-009](adr/009-key-management-and-cryptography.md)) — `Signer`/`KeyStore` port;
  non-exportable KMS/HSM signing (Vault Transit reference), envelope encryption, dual-control on
  privileged ops.
- **Outbox relay** — `FOR UPDATE SKIP LOCKED` + idempotent consumers.
