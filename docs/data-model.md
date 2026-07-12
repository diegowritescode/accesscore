# AccessCore — Data Model

Domain-first. Aggregates and value objects are pure (no ORM); the Drizzle adapter maps them to
rows (ADR-005). Persistence is PostgreSQL; JSONB is used for policy ASTs, namespace configs,
and decision-context snapshots.

## Value objects

- `UserId`, `OrgId`, `SessionId`, `TokenFamilyId`, `Kid` — UUIDs (typed, not raw strings).
- `Email` — normalized + validated; unique per tenant.
- `PasswordHash` — Argon2id PHC-encoded string (carries its params).
- `ResourceRef` — URN-like stable identifier `type:id` (e.g. `document:123`, `account:9`).
- `Action` — namespaced verb (e.g. `ledger.post`, `document.read`).
- `Revision` — monotonic `bigint` from a Postgres sequence; backs consistency tokens.

## Aggregates by bounded context

### identity

- **User** — `id`, `email`, `passwordHash`, `status` (`pending_verification` |
  `active` | `suspended`), `emailVerifiedAt`, timestamps. **Global identity — no `orgId`**
  (see [ADR-007](adr/007-tenancy-model.md)).
  _Invariants:_ email is **globally unique**; cannot authenticate unless `active` and email verified.

### authn

- **Session** — `id`, `userId`, `status` (`active` | `revoked`), `deviceLabel`, `userAgent`,
  `ip`, `createdAt`, `lastSeenAt`, `expiresAt`, `revokedAt`. A device-bound login context.
- **TokenFamily** — `id`, `userId`, `sessionId`, `status` (`active` | `revoked`), `createdAt`,
  `revokedAt`, `revokedReason`. Groups every refresh token issued off one login.
- **RefreshToken** — `id`, `familyId`, `tokenHash` (SHA-256, unique — the raw token is never
  stored), `generation`, `status` (`active` | `rotated` | `revoked`), `createdAt`, `expiresAt`,
  `consumedAt`. _Invariants:_ a refresh token belongs to exactly one family; presenting an
  already-rotated/revoked hash ⇒ revoke the whole family (reuse detection, ADR-003).
- **MfaEnrollment** — `userId`, `type` (`totp`), `secretEncrypted`, `confirmedAt`,
  `recoveryCodeHashes[]`. _Invariant:_ only a confirmed enrollment satisfies `aal ≥ 2`.
- **Signing keys** — non-exportable **Ed25519** keys held in **HashiCorp Vault Transit**
  ([ADR-009](adr/009-key-management-and-cryptography.md)); the application never stores private
  key material. The JWKS is derived live from Vault's key versions — each published as an
  `OKP`/`Ed25519` JWK with a `kid`→`alg` binding. Rotation advances the Vault key version
  (`active` / `next` / `retired` lifecycle). _Supersedes the earlier `privateKeyEncrypted`
  design._

### tenancy

- **Organization** — `id`, `name`, `slug`, timestamps.
- **Membership** — (`orgId`, `userId`, `status`, `joinedAt`). The org roster; a global `User`
  belongs to N orgs. A request's active org comes from the verified token, not a caller field.

### authz (the core)

- **RelationTuple** — `id`, `namespace`, `objectId`, `relation`, `subject` (either
  `user:<id>` or a userset `object#relation`), `orgId`, `revision`, `createdAt`.
  The ReBAC store. Indexes on (`namespace`,`objectId`,`relation`), (`subject`), (`revision`).
  RBAC is expressed here too (`role:admin#member@user:x`).
- **NamespaceDefinition** — `namespace`, `relationsConfig` (JSONB): userset rewrites
  (`computed_userset`, `tuple_to_userset`).
- **Policy** — `id`, `orgId`, `effect` (`permit` | `forbid`), `principalMatch`, `actionMatch`,
  `resourceMatch`, `conditionAst` (JSONB, the Cedar-like DSL), `priority`, `version`, `status`
  (`draft` | `active`), timestamps. The ABAC layer.
- **PermissionBoundary** — attaches a max-permission policy set to a principal (delegation ceiling).
- **DecisionLog** — `id`, `principal`, `action`, `resource`, `contextSnapshot` (JSONB),
  `effect`, `matchedRules` (JSONB derivation), `revisionUsed`, `latencyMs`, `at`. Append-only;
  feeds audit + the access analyzer.

### governance

- **AuditEvent** — `id`, `orgId`, `actor`, `action`, `target`, `metadata` (JSONB), `prevHash`,
  `hash`, `at`. _Invariant (tamper-evident):_ `hash = H(prevHash || canonical(event))`, forming
  a per-org hash chain verifiable end to end.

### cross-cutting

- **OutboxMessage** — `id`, `aggregateType`, `aggregateId`, `eventType`, `payload` (JSONB),
  `occurredAt`, `publishedAt`, `attempts`. Written in the same transaction as the aggregate
  change; a relay publishes it (the seam to EventBridge).

## Relationships (ERD, textual)

- `Organization 1—* User`, `Organization 1—* Membership *—1 User`.
- `User 1—* Session`, `User 1—* MfaEnrollment`.
- `Session 1—* TokenFamily 1—* RefreshToken` (refresh rotation history per login).
- `Organization 1—* RelationTuple / Policy / AuditEvent` (everything is tenant-scoped).
- `RelationTuple.subject` may reference a `User` or another tuple's userset (self-referential graph).
- `DecisionLog` and `AuditEvent` reference principals/resources by `ResourceRef`, not FKs
  (append-only logs must survive entity deletion).

## Consistency (see ADR-004)

Every tuple/policy write advances the global `Revision` sequence and stamps the row. `check()`
accepts a consistency token; reads are filtered to be "at least as fresh as" that revision.
Cache entries are keyed by revision so a stale entry cannot satisfy a fresher token.

## Drizzle & migrations

- Schemas declared with `pgTable`; enums via `pgEnum`; constraints (unique, FK, check) declared
  and emitted to SQL migrations by **drizzle-kit** (no `synchronize`).
- Complex tuple queries (recursive CTEs, revision reads) use Drizzle's `sql` template.
- Repositories map rows ↔ domain aggregates explicitly; use cases wrap writes in a
  `db.transaction` (Unit of Work) shared with the outbox writer.

## Post-review refinements (2026-07-11)

- **Revision changelog:** a `revisions` table (not a bare sequence) records commit-ordered
  revisions under an advisory lock; every tuple/policy/namespace write stamps its revision
  ([ADR-004](adr/004-authorization-consistency-model.md)). Each resource stores the zookie of its
  last ACL/content change.
- **DecisionLog is async:** decisions are buffered/batched (or emitted via the outbox) off the
  hot path to respect the p99 budget; `contextSnapshot` has a short retention (may hold IP/PII).
- **Audit tamper-evidence upgrade:** each per-org chain has a monotonic sequence number covered
  by the hash (detects truncation); checkpoints are signed by a KMS key the DB writer does not
  hold; `canonical(event)` is an injective, length-prefixed serialization over all fields.
- **Crypto at rest:** MFA secrets and other sensitive fields are stored as envelope-encrypted
  DEK ciphertext ([ADR-009](adr/009-key-management-and-cryptography.md)); destroying a DEK
  crypto-shreds the data.
- **SigningKey holds no private material:** only `kid`, `alg`, `publicJwk`, `status`, timestamps
  — the private key lives in the KMS/HSM behind the `Signer` port (ADR-009).
- **Sessions** record `auth_time`/`mfa_time` for step-up recency; every authz table carries
  `orgId` and traversals enforce `orgId` equality at each hop ([ADR-007](adr/007-tenancy-model.md)).
