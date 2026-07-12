# ADR-006: Password hashing — Argon2id

- **Status:** Accepted (2026-07-11)
- **Date:** 2026-07-11

## Context

AccessCore stores password credentials for a security product. Hashing must resist offline
GPU/ASIC cracking, be tunable over time, and support upgrading cost parameters without forcing
mass resets.

## Decision

Use **Argon2id** (via the `argon2` native binding) with OWASP-recommended parameters
(memory ≈ 19–64 MiB, time cost and parallelism tuned so a hash takes < ~250 ms on target
hardware). Each hash uses a unique random salt and stores its parameters in the encoded string
(PHC format), enabling **rehash-on-login** when parameters are upgraded. Verification is
constant-time. An optional application-level **pepper** (from a secret, not the DB) is
documented as defense-in-depth. Passwords are also screened against a breached-password list
(k-anonymity range query) at set/reset time.

## Consequences

### Positive

- Memory-hard resistance to parallel cracking; parameters evolve without disruption.
- Aligns with current OWASP / Password Hashing Competition guidance.

### Negative / costs

- CPU + memory cost per login (bounded by tuning); a native dependency to build in CI/Docker.

## Alternatives considered

- **bcrypt** — rejected: no memory-hardness; silent 72-byte input truncation.
- **scrypt** — viable and memory-hard, but Argon2id is the current first recommendation.
- **PBKDF2** — rejected except where FIPS compliance mandates it (not our case): weakest of the
  modern options against GPU attacks.

## Refinements from adversarial review (2026-07-11)

- Cap password input length (≤128 chars) to bound Argon2 cost/DoS; pin the parallelism
  parameter explicitly. For **unknown** users, run a dummy Argon2 verification against a fixed
  decoy hash to equalize latency (anti-enumeration). Register/reset always run identical work
  paths and return generic responses.
