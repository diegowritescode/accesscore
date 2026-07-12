# ADR-009: Key management & cryptography

- **Status:** Accepted (2026-07-11)
- **Date:** 2026-07-11

## Context

Signing private keys and encrypted secrets are the crown jewels: a stolen signing key lets an
attacker mint tokens with any `sub` and `aal`, defeating all authentication and step-up.
Adversarial review flagged that the wrapping key (KEK) was unspecified (same host as the DB =
one compromise yields ciphertext _and_ key) and that dangerous operations had no dual control.
The chosen posture is the most professional realistic option, even at higher complexity.

## Decision

- **Non-exportable signing via a `Signer` port backed by a KMS/HSM.** The application sends a
  payload/digest and receives a signature; **private key material never leaves the KMS/HSM.** A
  compromised application host cannot exfiltrate a signing key.
- **Reference production provider: HashiCorp Vault Transit** — self-hostable (fits the
  self-hostable IAM positioning), supports **Ed25519** signing with non-exportable keys and
  rotation, and runs in `docker compose` so the demo is real end to end. Adapters documented
  for **AWS KMS / GCP KMS / Azure Key Vault / PKCS#11 HSM**.
- **Algorithm:** **Ed25519 (EdDSA)** where the keystore supports it (Vault/software); **ES256
  (ECDSA P-256)** as the portable fallback for KMS providers lacking EdDSA. Each `kid` is bound
  to exactly one algorithm in the JWKS; verifiers enforce the JWK's declared `alg` (never the
  token header). _Supersedes ADR-003's "RS256 fallback"._
- **Secrets at rest via envelope encryption:** a KMS-held **KEK** wraps per-record/per-tenant
  **DEKs**; MFA secrets and other sensitive material are encrypted with DEKs. This enables
  **crypto-shredding** (destroy the DEK → data unrecoverable) for GDPR erasure.
- **Local/dev & test adapter:** a software `Signer`/`KeyStore` (keys in an encrypted keyfile)
  for unit tests and offline dev; Vault via docker-compose for integration/demo.
- **Key rotation:** JWKS `active` / `next` / `retired` lifecycle with **publish-before-sign**
  and **retire-after-drain**; scheduled + emergency rotation with a JWKS cache force-refresh path.
- **Privileged operations** (create/rotate signing key, edit an org guardrail, impersonate,
  read/export audit) require **AAL2 step-up + dual-control (four-eyes) + JIT elevation**, all
  written to the tamper-evident audit chain.

## Consequences

### Positive

- Strongest realistic posture: a single host compromise no longer yields token forgery or bulk
  secret disclosure. Crypto-shredding gives clean data-erasure.

### Negative / costs

- A Vault (or KMS) dependency and the port/adapters to maintain; signing is a network call
  (mitigated by caching public material and batching where safe).

## Alternatives considered

- **Private keys in env/DB** — rejected: one compromise forges everything.
- **App-held KEK on the same host** — rejected: no separation of ciphertext and key.
- **Cloud-KMS-only** — rejected as the _default_: ties the self-hostable story to a cloud
  account; retained as an adapter.
