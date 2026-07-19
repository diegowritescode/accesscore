# ADR-020: MFA & step-up authentication foundations

- **Status:** Accepted (2026-07-19)
- **Date:** 2026-07-19
- Make AAL2 reachable with a real second factor and define how assurance is proven, stored,
  encrypted, and elevated into the access token.

## Context

The authorization engine already treats `principal.aal` as a first-class ABAC attribute — it is
validated (`authz/domain/policy/condition.ts`), resolved (`authz/domain/policy/evaluate-condition.ts`),
carried on the `Principal` (`authz/domain/authorization-request.ts`), and authorable in policy
(`authz/interface/pap.dto.ts`). A tenant can already write `permit … if principal.aal >= 2`. But `aal`
is hardcoded to `1` at credential verification
(`authn/infrastructure/credentials/identity-credentials.ts`), so **AAL2 is unreachable** and every
step-up policy is dead on arrival.

`aal` is stored on the `sessions` row and copied into the JWT at issuance; refresh copies it forward.
The token is a **snapshot** of the session's assurance. ADR-009 designates MFA secrets as crown-jewel
material that must never sit in plaintext on the app host; ADR-018 already makes the audit trail
append-only at the DB level. This ADR adds the second factor, its at-rest protection, the assurance
model, and the enrollment lifecycle. The HTTP flows (enrollment, step-up, lockout, audit hash-chain)
are delivered by US-6.1..6.5 and integrate on the seams defined here; **US-6.0 delivers foundations
only** (aggregates, value objects, ports, adapters, tables, wiring).

## Decision

### TOTP (RFC 6238)

- **HMAC-SHA1, 6 digits, 30s period** — the de-facto `otpauth://` baseline every authenticator app
  (Google Authenticator, 1Password, Authy) assumes; deviating breaks interoperability for no real
  gain (the HMAC key, not the hash, is the secret).
- **Drift window ±1 step** (accept `t-1, t, t+1`, ~90s tolerance) to absorb clock skew, matching the
  JWT clock-skew already tolerated.
- **Secret: 160-bit (20-byte) CSPRNG**, Base32-encoded into the `otpauth://` URI.
- **Replay guard:** the accepted counter is persisted as `last_used_step`; a code at a step ≤
  `last_used_step` is rejected, so a captured 6-digit code cannot be replayed inside its own window.

### TOTP secret at rest — Vault Transit encryption-as-a-service

The secret is encrypted through a `SecretEncryptor` port; the aggregate only ever holds **ciphertext**,
never the key or plaintext key material. Production uses **Vault Transit `encrypt`/`decrypt`** on a
dedicated `accesscore-mfa` key, reusing the exact Vault wiring proven for the JWT signer
(`VaultTransitSigner`): the key is non-exportable, the app sends plaintext and receives an opaque
`vault:v1:…` ciphertext. Dev/test uses a `SoftwareSecretEncryptor` (AES-256-GCM), mirroring the
`SoftwareSigner` fallback and the `SIGNER_DRIVER` switch.

This **refines** ADR-009's "envelope encryption for MFA secrets" for the small-secret case. Envelope
encryption exists to avoid round-tripping _bulk_ plaintext to the KMS — you encrypt large data locally
with a DEK and only wrap the tiny DEK. A TOTP secret is 20 bytes, smaller than a DEK: there is no bulk
to keep local, so a per-record DEK adds a `wrapped_dek` column and two crypto operations for zero size
benefit while still requiring a Vault call. Direct Transit encryption satisfies ADR-009's actual
invariant (key never on the app host, non-exportable, rotatable) with less code. Crypto-shredding
granularity drops from per-record to per-key; acceptable because a TOTP secret is **re-enrollable** —
destroying it costs a re-enrollment, not data loss. ADR-009's DEK envelope remains the right tool for
future _bulk_ sensitive fields.

### Assurance (AAL) model

- **Password only → AAL1.** A second factor (TOTP or recovery code) → **AAL2**.
- **`aal` is owned by the `sessions` row; the token is a snapshot.** Credential verification stops
  hardcoding `1` and reports whether the user holds an _active_ MFA credential. Elevation is a session
  mutation: verify the factor → set `sessions.aal = 2` and `auth_time = now` → **reissue** the access
  token from the elevated row. Because refresh already copies `session.aal` forward, all later tokens
  on that session are AAL2 without further action.
- **No live downgrade.** An AAL1 token minted before step-up stays AAL1 until it expires (≤
  `ACCESS_TOKEN_TTL`, 15 min). We deliberately do not revoke it: the PDP reads `token.aal`, so it
  simply fails any `aal >= 2` policy. Elevation is additive and fail-safe; there is no downgrade path a
  caller can exploit.

### Step-up decision semantics

No PDP change. Step-up is realized entirely by making AAL2 _reachable_: once a session is elevated,
`token.aal = 2` flows through `AccessTokenGuard` → `Principal.assuranceLevel` →
`EvaluationContext.principal.aal`, and any `principal.aal >= 2` policy begins permitting. Privileged
operations (key rotation, guardrail edits, audit export) are expressed as such policies.

### Recovery codes

- **10 single-use codes**, generated at activation (regenerable). Each is high-entropy Base32; we
  store only a **SHA-256 hash with a unique index**, mirroring the existing verification/reset token
  stores, for O(1) lookup and single-use consumption via `consumed_at`. Argon2id is not used: the codes
  are machine-generated and high-entropy, so a fast hash suffices, and matching an attempt would
  otherwise cost up to 10 Argon2 verifications. Regeneration replaces the whole batch. Redeeming a code
  elevates to AAL2 exactly like TOTP.

### Enrollment / activation state machine

`pending → active → revoked`.

- **enroll:** generate secret → encrypt → persist as `pending`, return the `otpauth://` URI. A pending
  credential is not a usable factor; `aal` stays 1.
- **activate:** a TOTP that verifies against the pending secret → `active`, set `activated_at`, generate
  the recovery-code batch. Only now is it a factor.
- **revoke / disable:** requires AAL2 (a privileged self-service op).
- **At most one active TOTP per user**, enforced by a partial unique index; a new enrollment supersedes
  any prior pending one.

## Consequences

- AAL2 becomes real; every existing step-up policy activates with **no PDP change** — a clean
  demonstration that the ABAC engine was built for this.
- Secrets are non-exportable and reuse the proven Vault Transit path; no new crypto stack.
- Session-owned `aal` + snapshot token gives a coherent, fail-safe elevation model that refresh already
  respects; no downgrade attack surface.
- MFA verification adds one Vault `decrypt` per step-up (bounded — step-up is rare, off the token hot
  path); the JWT verify path is unaffected.
- Per-user crypto-shredding is traded for per-key, mitigated by re-enrollability.
- TOTP's 6-digit space (10⁶) makes step-up brute-forceable without throttling; this is **load-bearing**
  and delegated to US-6.4 lockout (per-credential lock on failed OTPs), not optional.

## Alternatives considered

- **Per-record DEK envelope (literal ADR-009)** — rejected for a 20-byte secret: adds a wrapped-DEK
  column and two crypto ops for no size benefit; still needs a Vault call.
- **App-held AES key from env** — rejected per ADR-009: no separation of ciphertext and key.
- **WebAuthn/passkeys as the first second factor** — deferred (higher client complexity); TOTP is the
  universally demonstrable baseline. The `SecondFactor` seam admits a WebAuthn adapter later without
  touching the aal/session model.
- **Mandatory MFA at login only** — rejected as the sole model: the session-elevation primitive makes
  "require MFA at login" and "step up on demand" the same operation with different triggers.
- **Argon2id-hashed recovery codes** — rejected: unnecessary for high-entropy codes and 10× the verify
  cost per attempt.
