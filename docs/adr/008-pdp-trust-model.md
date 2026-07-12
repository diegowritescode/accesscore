# ADR-008: PDP trust model — input provenance

- **Status:** Accepted (2026-07-11)
- **Date:** 2026-07-11
- Closes the critical finding from adversarial review: a PDP that trusts caller-supplied
  context/attributes is a forgeable-authorization oracle.

## Context

`check(principal, action, resource, context)` is called over the wire by consumer PEPs. If
`context.*` or resource attributes are **caller-asserted**, every ABAC condition is forgeable
and object-level authorization (BOLA/IDOR) is _not_ actually enforced — a compromised or buggy
service could claim `context.mfaPresent = true` or `resource.owner == principal` and the PDP
would rubber-stamp it.

## Decision

Classify every PDP input by **provenance**; the PDP trusts only what it can verify or derive.

1. **Identity & assurance** (`sub`, `aal`, `org`, `sid`, `auth_time`) — taken **only from the
   cryptographically verified access token**. Never from `context`.
2. **Environmental context** (`ip`, `time`, `requestId`) — **observed server-side** at the
   PDP/PEP edge. Never accepted from callers.
3. **Resource / subject facts** — resolved **authoritatively by the PDP from relationship
   tuples** (the preferred model). Caller-supplied resource attributes are untrusted hints and
   **must never grant access on their own**.

Therefore, **v1 ABAC conditions reference only classes (1) and (2)**. Authorization-relevant
resource facts are modeled as tuples (`document:123#owner@user:x`), not attributes.

- **Invariant (property-tested):** no caller-supplied field can flip a `deny` to a `permit`;
  a forged context cannot escalate.

## Consequences

### Positive

- Closes the forgeable-authorization hole; keeps the PDP an _authority_, not an oracle.
- Facts modeled as tuples are consistent and revisioned (fits ADR-004).

### Negative / costs

- Authorization facts must be provisioned as tuples (more writes) rather than read ad-hoc.

## Alternatives considered

- **Trust caller-supplied context/attributes** — rejected: total authorization bypass.
- **PDP fetches resource attributes synchronously from services** — rejected for v1: coupling
  and hot-path latency.
- **Signed/authenticated entity store (Cedar-style)** — deferred to a ring: enables trusted
  caller-provided attributes when a use case genuinely needs them.
