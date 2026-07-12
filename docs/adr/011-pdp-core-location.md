# ADR-011: PDP core location — pure domain service vs. workspace package

- **Status:** Accepted (2026-07-12)
- **Date:** 2026-07-12
- First decision of Slice 3 (US-3.0): where the PDP evaluation core lives before we build it.

## Context

[ADR-002](002-authorization-model.md) defines the PDP contract —
`check(principal, action, resource, context) → Decision{effect, reasons[]}` with IAM-style
deny-override and explainable `reasons`. The roadmap left open **where its evaluation core
lives**, and Slice 3 forces the answer. Two homes are plausible:

- **(a)** a domain service inside the `authz` bounded context (`apps/api/src/authz/domain/`);
- **(b)** the standalone `@accesscore/policy-engine` workspace package, which today holds only a
  version stub (`POLICY_ENGINE_VERSION`).

A precise scope matters. The "PDP core" is the **pure, synchronous evaluator**: given
already-resolved tuples, policies, and a trusted context, it returns a `Decision` — no IO, no
store access (US-3.3). It is distinct from the **async application-level `check`** (US-3.4),
which resolves tuples from the store at a revision ([ADR-004](004-authorization-consistency-model.md))
and then calls the pure core. Both live in `authz`; the tuple store (US-3.1) and the PEP guard
(US-3.5) are separate layers/HUs. This ADR decides only where the pure core lives.

## Decision

- **The PDP core is a pure domain service in `apps/api/src/authz/domain/`** — deterministic and
  IO-free, with **no Nest, Drizzle, or other framework/ORM imports**. Its inputs are resolved
  facts (tuples/policies) plus a context whose provenance is fixed by
  [ADR-008](008-pdp-trust-model.md); its output is a `Decision`.
- **`authz` follows the same hexagonal shape as `authn` / `identity` / `tenancy`** — domain /
  application / infrastructure / interface, wiring ports to implementations in `authz.module.ts`
  ([ADR-001](001-architecture-style.md)). The pure evaluator sits in `domain`; the async
  `check` orchestrator sits in `application` and depends on a tuple-store port.
- **`@accesscore/policy-engine` stays a stub — the documented future home, not the current one.**
  We do not extract the evaluator into the package now.
- **Deferral trigger (when we WOULD extract):** the moment there is a **genuine second consumer** —
  either a second in-process consumer, or the published SDK
  (`@diegowritescode/accesscore-sdk`) needing to run checks **client-side / offline**, or a
  future service that must evaluate without the API. Keeping the core pure is exactly what makes
  that a **lift-and-shift, not a rewrite**: no Nest/Drizzle dependencies to unwind.

The core's contract depends on decisions made elsewhere — trust/provenance
([ADR-008](008-pdp-trust-model.md)), consistency and org-scoped traversal
([ADR-004](004-authorization-consistency-model.md), [ADR-007](007-tenancy-model.md)). This ADR
references those as inputs; it does not re-decide them.

## Consequences

### Positive

- **Property-testable in isolation.** With no IO, US-3.3 can `fast-check` the evaluation
  invariants directly (deny-override holds; the permission boundary is never exceeded) — the
  rigor [ADR-002](002-authorization-model.md) promised.
- **Analyzable.** A pure function of resolved facts is what the console's Authorization Playground
  needs to simulate and explain decisions.
- **Cheap future extraction.** Purity keeps the eventual move into `@accesscore/policy-engine` a
  mechanical lift-and-shift, so deferring costs us nothing later.
- **No premature overhead.** We avoid a package build/release cycle (Changesets) and a public API
  surface that would have zero consumers today.

### Negative / costs

- The `@accesscore/policy-engine` package remains an empty stub — a "why is this here?" until a
  consumer arrives. Mitigated by this ADR recording its intended role and the extraction trigger.
- Purity is a discipline, not a default: a dependency boundary (lint rule / import guard) must
  keep Nest/Drizzle/IO from leaking into `authz/domain`, or the extraction guarantee erodes.
- If a second consumer materializes sooner than expected, we pay a (bounded, lift-and-shift)
  extraction cost then rather than now.

## Alternatives considered

- **Extract into `@accesscore/policy-engine` now** — rejected: premature (YAGNI). There is no
  second consumer, and a workspace-package boundary adds build/release (Changesets) overhead and
  a maintained API surface for zero current benefit. The `authz` module boundary already enforces
  encapsulation. Documented as the future path with explicit triggers above.
- **Embed an external engine (OpenFGA / SpiceDB / Cedar / OPA) as the core** — rejected in
  [ADR-002](002-authorization-model.md); we borrow their models, not their binaries. Not
  re-litigated here.
- **PDP as an infrastructure adapter or a separate microservice** — rejected for v1: authorization
  is domain logic, and this is a modular monolith ([ADR-001](001-architecture-style.md)). A network
  hop and the added coupling are unjustified at this scale; the modular seam is the extraction
  point if that ever changes.
