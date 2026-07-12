# AccessCore — Security

Security is the product. This is the design-time threat model and control set (the seed of the
portfolio's OWASP security dossier). It will be validated by adversarial review before and
after implementation.

## Assets

Credentials (password hashes, MFA secrets), signing keys, access/refresh tokens, PII,
authorization data (tuples/policies), and the audit/decision logs.

## Trust boundaries

Public API ↔ internet; admin API (PAP) ↔ operators; service-to-service (SDK) ↔ spine services;
app ↔ PostgreSQL; app ↔ Redis.

## STRIDE analysis & controls

- **Spoofing** — Argon2id + MFA (TOTP; passkeys as a ring); asymmetric token signatures
  verified by consumers; **anti-enumeration** (login/register/reset never reveal whether an
  email exists); timing-safe credential comparison.
- **Tampering** — asymmetric JWT integrity; **tamper-evident audit** (hash chain); DB-enforced
  invariants; strict input validation and DTO whitelisting to prevent **mass assignment**.
- **Repudiation** — append-only **decision logs** + audit trail with actor identity and hash-
  chain evidence; every authorization decision records its derivation.
- **Information disclosure** — no user enumeration; **no secrets in tokens or logs**;
  encryption at rest for MFA secrets and signing private keys; PII minimization; TLS in transit.
- **Denial of service** — per-IP rate limiting (stricter on the credential endpoints), request
  body-size limits, and DTO length caps that bound Argon2 work; brute-force **lockout**
  (per-account with backoff) is planned; the PDP **fails closed**, is cached, and is protected by
  circuit breakers and query limits.
- **Elevation of privilege** — deterministic **deny-override** evaluation; **permission
  boundaries**; object-level authorization via the PDP prevents **IDOR/BOLA**; **step-up**
  (MFA) required for sensitive actions; admin API separated from the user API; least privilege.

## Token-specific defenses

- **Algorithm confusion** — pin the expected algorithm; reject `alg=none` and reject symmetric
  algorithms where asymmetric is expected (no RS256→HS256 downgrade).
- **Replay** — short access-token TTL, `jti`/nonce tracking where needed; refresh **reuse
  detection** revokes the token family.
- **New-enemy problem** — consistency tokens on relationship reads (ADR-004).
- **CSRF** — for any cookie-based OIDC browser flows, use `state`/PKCE and same-site cookies.

## Key & secret management

Signing keys rotated on a schedule (JWKS with `active`/`next`/`retired`); private keys and MFA
secrets encrypted at rest; application secrets from environment/secret manager; **nothing in
git** (`.env.example` documents variables).

## Standards alignment

- **NIST 800-63** — authenticator assurance levels (`aal` claim; step-up to AAL2).
- **OWASP API Security Top 10** — mapped per endpoint in the security dossier.
- **OWASP ASVS** — used as the verification checklist for the auth/session/access-control chapters.

## Verification

- Property-based tests assert authorization invariants (deny-override holds; boundaries never
  exceeded).
- Adversarial review by the `security-auditor` subagent on the design and, later, the code.
- Security scanning (dependency + SAST + secret scanning) wired into CI (ring).

## Post-review hardening (2026-07-11)

Pressure-tested by an adversarial security review; the material changes:

- **Input provenance ([ADR-008](adr/008-pdp-trust-model.md)):** the PDP trusts only token-derived
  identity, server-observed environment, and tuple-resolved facts — closing a caller-forgeable
  authorization bypass (BOLA).
- **Token binding:** access tokens validate `aud`/`iss`/`exp`/`nbf` to stop cross-service
  replay/confused-deputy; revocation for offline verifiers is TTL-bounded (short TTLs;
  introspection for sensitive audiences; blocklist fails closed).
- **Audit:** hash chain hardened against a store-level attacker — per-org monotonic sequence in
  the hash (anti-truncation) + KMS-signed checkpoints (the writer cannot re-chain); external
  anchoring is a ring.
- **Keys/operators ([ADR-009](adr/009-key-management-and-cryptography.md)):** non-exportable
  KMS/HSM signing; envelope encryption + crypto-shredding; AAL2 step-up + dual-control + JIT for
  key ops, guardrail edits, and impersonation.
- **Tenant isolation:** `orgId` equality at every graph hop; guardrails operator-only; no
  principal can widen its own boundary/guardrail.
- **DSL:** total language; condition errors fail closed; a `forbid` that errors counts as matching.
- **Caching:** context-dependent (ABAC) decisions are not cached by relation alone (no stale
  step-up bypass).
- **MFA/credentials:** TOTP single-use + rate-limited; `auth_time`/`mfa_time` for step-up recency;
  dummy Argon2 verify for unknown users; lifecycle events revoke sessions/families/tokens.
- **Rings:** signed entity store, sender-constrained tokens (DPoP/mTLS), external audit anchoring,
  OIDC-provider hardening (exact `redirect_uri`, PKCE, single-use codes, `nonce`).

## Implementation status (2026-07-12, end of Slice 2.5)

This document is the target threat model; controls land incrementally across the spine. What is
enforced in code today, and what is scheduled, so the doc never overclaims:

- **Enforced now** — Argon2id + timing-safe compare + dummy verify for unknown users;
  anti-enumeration on login/register/reset; asymmetric (EdDSA) token signatures verified against
  a published JWKS; `iss`/`aud`/`exp`/`nbf` binding with bounded clock skew; refresh **reuse
  detection** revoking the family + TTL-bounded access-token blocklist; per-IP rate limiting
  (global default plus a tighter budget on `login`/`refresh`); `helmet` security headers; request
  body-size limit and DTO length caps; **fail-fast config guards** (production refuses the
  software signer and the dev default Vault token); non-exportable Vault Transit signing keys.
- **Scheduled — Slice 3 (PDP):** object-level authorization (IDOR/BOLA prevention),
  deny-override evaluation, consistency tokens, and the decision log.
- **Scheduled — Slice 6 (hardening):** per-account brute-force **lockout** with backoff, and the
  **tamper-evident audit** hash chain (per-org monotonic sequence + signed checkpoints). Both are
  designed above and tracked as portfolio deliverables; they are deliberately deferred, not
  dropped.
