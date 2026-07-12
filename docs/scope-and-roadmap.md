# AccessCore — Scope & Roadmap

Robust means a **correct, deterministic, verifiable, consistent, observable core**, then
capability **rings** added in value order. Deferring a ring is a decision, not an omission.

## Committed robust core (v1)

The core is not shippable until all of this is true and demonstrated:

- **Identity + password auth** — Argon2id, register/login, value objects, `Result` errors,
  anti-enumeration, timing-safe, account lockout (per-account + per-IP).
- **Token platform** — asymmetric JWT (EdDSA) + JWKS + key rotation; refresh rotation +
  **reuse detection** + token families; Redis revocation; device-bound sessions; logout-all.
- **The PDP** — hybrid ReBAC + RBAC + ABAC; Cedar-like policy DSL; **deny-override**
  evaluation; **consistency tokens**; **decision logs**; `check` / `expand` / `batchCheck`.
- **MFA** — TOTP + recovery codes; `aal` claim; step-up conditions.
- **Account security** — email verification, secure password reset (single-use, hashed,
  expiring), **tamper-evident audit log** (hash-chained).
- **Engineering quality** — transactional outbox + domain events; OpenAPI; RFC 7807 errors;
  real migrations; DB-enforced invariants; config validated at boot; OTel observability.
- **Testing** — unit + integration (real Postgres/Redis via docker-compose) + **property-based
  tests of the evaluator**; ~85%+ coverage on core logic; CI (lint → test → build).
- **Delivery** — `docker compose up` from a clean clone; deployed with a public URL.
- **Console (curated deep screens)** — Users + Sessions/token-families, RBAC editor,
  **Authorization Playground** (visual ReBAC + `check` explainer), **Audit integrity verifier**.

## Ring 1 — Modern auth & delegation

WebAuthn/passkeys · step-up flows · assume-role / token exchange (RFC 8693) · **permission
boundaries** · service accounts + API keys (rotation, last-used).

## Ring 2 — Standards & federation

Full OIDC provider (authorization code + PKCE, client credentials, device grant, `/userinfo`,
discovery, consent) · external IdP relying party (OIDC/SAML) · SCIM provisioning.

## Ring 3 — Governance & scale

Access analyzer (unused access, generate-least-privilege from decision logs, reverse "who can
access X") · access reviews / attestation · separation of duties (SoD) · JIT access + break-
glass · workload identity federation (OIDC/SPIFFE) · full multi-region/HA · k6 load + chaos.

## Build order — vertical slices

Each slice is end-to-end (domain → API → tests → CI) and independently deployable.

0. **Walking skeleton** — health/readiness, config validation, DB + first migration, one
   trivial end-to-end path, docker-compose, CI green, deployed.
1. **Identity + password auth** — the `User` aggregate, Argon2id, register/login, anti-enumeration.
2. **Token platform** — asymmetric JWT + JWKS, refresh rotation + reuse detection, sessions, revocation.
3. **PDP v1 (RBAC-over-tuples)** — tuple store, role/permission checks, PEP guard, decision logs, property tests.
4. **PDP v2 (ReBAC)** — namespaces, userset rewrites, `expand`, consistency tokens.
5. **PDP v3 (ABAC)** — policy DSL parser/evaluator, conditions, deny-override, permission boundaries, simulation/shadow.
6. **Account security** — email verification, password reset, MFA (TOTP), lockout, tamper-evident audit.
7. **Admin console** — Users/Sessions, RBAC editor, Authorization Playground, Audit verifier.

Then rings, in value order, each shippable on its own.

## Post-review additions (2026-07-11)

Folded into the committed **core** (not deferred), from the design reviews:

- Input-provenance trust model (ADR-008); `aud`/`iss` token binding + TTL-bounded revocation;
  JWKS rotation timing.
- Commit-ordered revisions + zookie lifecycle + context-aware caching (ADR-004); org-scoped
  traversal + cycle detection.
- Non-exportable KMS/HSM signing via **Vault Transit in docker-compose** (ADR-009); envelope
  encryption for secrets at rest.
- Delegation-authority rules (operator-only guardrails, no self-widening boundaries), DSL
  totality + fail-closed evaluation, lifecycle revocation, anti-enumeration.

New / updated **rings**:

- Signed entity store (trusted caller attributes); sender-constrained tokens (DPoP/mTLS);
  external WORM/transparency anchoring of the audit head; full OIDC-provider hardening;
  introspection endpoint for high-sensitivity verifiers.

**Slice note:** slice 2 (token platform) stands up **Vault Transit in docker-compose** for real
non-exportable signing.
