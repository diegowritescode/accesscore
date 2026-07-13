# AccessCore — Testing Strategy

Testing is a first-class part of the design, not an afterthought. AccessCore is a security
product: its guarantees (anti-enumeration, reuse detection, fail-closed revocation, and — from
Slice 3 — deterministic authorization) are only real if they are _proven_ by tests that exercise
the actual failure modes. This document is the contract for how we test.

## The pyramid

| Layer           | Runner                                                                        | What it proves                                                                                                                                             | Boundaries                                                                   |
| --------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Unit**        | `jest` (`src/**/*.spec.ts`)                                                   | Domain + application behavior, deterministic, with injected fakes (clock, repos, ports). The bulk of the assertions.                                       | None — pure, no I/O.                                                         |
| **Integration** | `jest --config test/jest-integration.json` (`test/integration/*.int-spec.ts`) | Adapters against **real** Postgres / Redis / Vault: DB-enforced constraints, row-level concurrency, Vault Transit signing + rotation, Redis TTLs.          | Real infra via docker-compose.                                               |
| **E2E**         | `jest --config test/jest-e2e.json` (`test/*.e2e-spec.ts`)                     | Full HTTP flows through the booted Nest app + real DB: the security properties end to end (blocklisted-but-valid JWT rejected, IDOR → 404, reuse cascade). | Real app + DB; signing via the in-process `software` driver for hermeticity. |

Determinism is non-negotiable: the `Clock` is a port injected everywhere, so time-dependent logic
(token expiry, key-rotation drain windows, refresh grace) is tested by advancing a fake clock,
never by sleeping on the wall clock.

## Coverage — honest and enforced

Coverage is collected from **all three** suites and **merged** (`nyc`), so an adapter covered only
by integration/e2e counts. A per-run number would be misleading (unit alone leaves infra at 0%).

- `pnpm --filter @accesscore/api run coverage` runs the three suites with coverage, merges the
  Istanbul reports into `.nyc_output`, prints the summary, and runs `nyc check-coverage`.
- Thresholds live in `apps/api/.nycrc.json` and are enforced in CI. They are a **ratchet**: set at
  a floor below the current number and only ever raised, never lowered.
- Current core-logic coverage (merged, all three suites): **~95% lines / ~94.8% statements /
  ~90.4% functions / ~85.9% branches** — above the CI gate floor (lines 90 / statements 90 /
  functions 85 / branches 75). Suite sizes: 158 unit + 37 integration + 37 e2e (API) + 11 SDK.

## Property-based testing (the PDP)

The authorization evaluator (Slice 3) is a **pure** function `(*tuple snapshot*, request) → Decision`
with no I/O, precisely so it can be hammered with `fast-check`. The properties we assert:

- **Totality / fail-closed:** returns a `Decision` for every generated input; never throws; unknowns → deny.
- **Deny-by-default & deny-override:** adding a matching `forbid` never flips a decision to allow.
- **Determinism:** identical `(tuples, request, consistency token)` → identical decision.
- **Tenant isolation:** no resolution crosses `orgId` at any hop.
- **Provenance (ADR-008):** no caller-supplied context field can flip a `deny` to a `permit`.
- **Cycle safety:** cyclic tuple graphs terminate and deny.

`fast-check` is wired now (see `email.property.spec.ts` for the pattern) so Slice 3 lands with
property tests, not after.

## Fixtures

Integration/e2e run a `globalSetup` (`test/support/global-setup.js`) that migrates the database, so
a clean clone can run the suites with no manual step. As the tuple store lands (Slice 3), a shared
app/e2e harness and reusable relation-tuple + **consistency-token (zookie)** factories join it —
capturing the revision after a write and querying at/behind it to prove read-after-write.

## Deliberately deferred (not gaps)

The build order (see [scope-and-roadmap.md](scope-and-roadmap.md)) sequences some hardening later,
by design:

- **Per-account lockout with backoff** and its **tamper-evident audit** integration land in
  **Slice 6 (Account Security & Audit)**, where the audit chain lives. Slice 2.5 ships per-IP
  throttling. See [ADR-010](adr/010-session-revocation-and-context-coupling.md) context.
- **MFA / TOTP** and step-up assurance tests land with MFA in Slice 6.
- **Load / chaos (k6)** on the PDP is a Governance-ring concern.
