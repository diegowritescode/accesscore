# ADR-010: Session revocation and the identity ↔ authn coupling

- **Status:** Accepted (2026-07-12)
- **Date:** 2026-07-12

## Context

Two bounded contexts reference each other:

- **authn** needs **identity** to verify credentials at login (the `Credentials` port is
  implemented against the user store + Argon2 hasher).
- **identity** needs **authn** to terminate sessions on credential-lifecycle events — password
  reset (and later MFA change, suspension, deprovisioning) must revoke refresh families and
  blocklist live access tokens (ADR-003 lifecycle revocation). Identity owns the
  `SessionRevoker` port; only authn can satisfy it.

This is a genuine bidirectional relationship, not an accident of layering.

Revocation also has to be **effective despite offline verification**: access tokens are verified
without a network call, so immediate revocation needs a shared signal.

## Decision

- **Revocation signal = a Redis blocklist keyed by `sid`.** Logout / logout-all / lifecycle
  events add the session's `sid` to `authn:revoked:sid:<sid>` with a TTL pinned to the access
  token's remaining life. The PEP (`AccessTokenGuard`) verifies the JWT (kid → JWK `alg`, ADR-009)
  **and** checks the blocklist, failing closed on a Redis error. Offline verifiers that skip the
  blocklist remain bounded by the short access-token TTL.
- **`SessionTerminator` (authn application service)** owns the mechanism: revoke the token
  family (by session or by user), revoke the session rows, and blocklist the affected `sid`s.
  Logout/logout-all controllers and the `SessionRevoker` implementation all delegate to it.
- **The `SessionRevoker` port stays in identity; authn provides the implementation.** The two
  modules are wired with **`forwardRef`** (a documented, localized circular module dependency).
  The cross-links are independent chains — credential verification does not depend on session
  termination or vice versa — so there is no provider-construction cycle.
- **Target state: make the identity → authn direction event-driven.** Password reset already
  writes to the transactional outbox; once the outbox relay lands, authn will react to an
  `identity` lifecycle event and the synchronous `SessionRevoker` call (and the `forwardRef`)
  can be removed. Until then, synchronous revocation is the correct behavior — a password reset
  must not leave live sessions.

## Consequences

### Positive

- Revocation is immediate for online verifiers and TTL-bounded for offline ones; the security
  guarantee is explicit and testable.
- The coupling is contained to one port + one `forwardRef`, and the path to decoupling (events)
  is defined.

### Negative / costs

- A circular module dependency (`forwardRef`) until the outbox relay exists.
- A Redis dependency on the token-verification hot path (mitigated: fail-closed, short TTLs).

## Alternatives considered

- **Pure TTL expiry, no blocklist** — rejected: a reset/logout would leave a valid access token
  usable for minutes.
- **Stateful (opaque) access tokens + introspection on every request** — rejected as the default
  (latency, coupling); retained as an option for high-sensitivity verifiers (ADR-003).
- **Event-driven revocation now** — deferred: no outbox relay yet; it is the documented target.
- **Merging identity and authn into one module** — rejected: the context boundary (global
  identity vs. session/token platform) is worth keeping; the coupling is narrow.
