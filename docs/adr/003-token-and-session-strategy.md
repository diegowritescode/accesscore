# ADR-003: Token & session strategy

- **Status:** Accepted (2026-07-11)
- **Date:** 2026-07-11

## Context

AccessCore issues tokens consumed by multiple independent services (the spine). It needs:
stateless verification by consumers without sharing a secret, key rotation, immediate
revocation when needed, and detection of stolen refresh tokens. It must also stay standards-
aligned so it can grow into an OIDC provider.

## Decision

- **Asymmetric signing** — EdDSA (Ed25519) preferred, RS256 as compatibility fallback.
  Publish a **JWKS** endpoint; support multiple active keys via `kid` and **scheduled key
  rotation**. Consumers verify with public keys — no shared secret.
- **Access tokens** — short-lived (~10–15 min), stateless, minimal claims. They assert
  _identity and session assurance_ (`sub`, `aal`, `sid`, tenant), **not** authorization
  verdicts. Authorization is decided by the PDP at the PEP (or via explicitly downscoped
  tokens).
- **Refresh tokens** — opaque, stored hashed, **rotated on every use**. **Reuse detection:**
  presenting an already-rotated refresh token implies theft → **revoke the entire token
  family** and raise a security event. Bound to a session/device.
- **Revocation** — a Redis blocklist keyed by `sid`/`jti` gives near-immediate revocation for
  access tokens despite their stateless nature (bounded by their short TTL). Refresh families
  are revoked in the store.
- **Step-up** — `aal` (authenticator assurance level) is a first-class claim; PDP conditions
  can require `aal ≥ 2` or a recent MFA assertion for sensitive actions.

## Consequences

### Positive

- Services verify tokens independently and offline; key rotation without downtime.
- Stolen refresh tokens are detected and contained (family revocation).
- Clean separation: tokens carry identity, the PDP owns authorization → tokens never go stale
  with respect to permissions.

### Negative / costs

- Key management (generation, rotation, JWKS) and a Redis dependency for revocation.
- Slightly more moving parts than a single-secret HS256 setup.

## Alternatives considered

- **Symmetric HS256, single secret** — rejected: every consumer would need the secret; no
  clean rotation; weaker blast radius.
- **Long-lived access tokens, no revocation** — rejected: unacceptable for a security product.
- **Opaque access tokens + introspection endpoint** — considered; rejected as default for
  latency and coupling (consumers would call AccessCore on every request). May be offered as
  an option for high-sensitivity clients.
- **Embedding authorization decisions in the access token** — rejected: permissions would go
  stale between refreshes; violates the PDP-owns-authorization principle.

## Refinements from adversarial review (2026-07-11)

- **Audience/issuer binding:** access tokens carry `aud`, `iss`, `exp`, `nbf`; the SDK verifier
  enforces all four. Tokens are audience-scoped (per target service) or downscoped via token
  exchange (RFC 8693); a token captured at a low-trust service cannot be replayed at a higher-
  value one (confused-deputy defense).
- **Revocation reality:** offline verification means access-token revocation is bounded by TTL —
  so TTLs are short (≤5 min for sensitive audiences); an introspection option exists for high-
  sensitivity consumers; Redis blocklist entries are pinned to the token's remaining life,
  excluded from eviction, and blocklist-check failures **fail closed**.
- **JWKS timing:** publish `next` before first use; keep `retired` in JWKS until all tokens it
  signed expire; define a cache max-age; provide an emergency force-refresh path.
- **Signing:** keys are non-exportable in a KMS/HSM; Ed25519 (ES256 fallback) with `kid`→`alg`
  binding — see [ADR-009](009-key-management-and-cryptography.md) (supersedes the RS256 fallback
  above).
- **Refresh concurrency:** a short **reuse grace window** (re-presentation of the immediately-
  prior token within N seconds returns the same new pair) prevents benign parallel refreshes
  from falsely revoking the family; reuse of an _older_ generation still triggers revocation.
- **Step-up recency:** tokens carry `auth_time` (and `mfa_time`); step-up conditions evaluate
  freshness, not just a static `aal`.
- **MFA hardening:** TOTP codes are single-use (rejected on reuse within their window); the
  second factor is rate-limited/lockable; recovery codes are hashed, single-use, and regenerable
  (regeneration invalidates prior codes).
- **Lifecycle revocation:** password reset, MFA change, suspension, and deprovisioning revoke all
  refresh families, terminate sessions, and blocklist live access-token `sid`s, emitting
  `AccessRevoked`.
