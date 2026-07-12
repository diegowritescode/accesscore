# ADR-004: Authorization consistency model (the "new-enemy problem")

- **Status:** Accepted (2026-07-11) — revised after adversarial review
- **Date:** 2026-07-11

## Context

Relationship-based authorization has a subtle correctness hazard Google named the
**"new-enemy problem"**: if we (a) remove Alice's access to a resource and then (b) add
sensitive content to it, a check reading a **stale** relationship snapshot could let Alice see
the new content. Caching and read replicas make stale reads the norm.

Adversarial review found that a naive **Postgres sequence** does _not_ provide the guarantee: a
sequence orders _allocation_, not _commit visibility_ (tx A may take revision 100 yet commit
after tx B with revision 101), so reading "latest = `max(revision)`" can miss committed writes.
The mechanism below fixes that.

## Decision

- **Commit-ordered global revision.** All authorization-relevant writes — relationship tuples,
  policies, **and** namespace configs — advance a single global revision whose order equals
  **commit** order. Mechanism: writes record into a `revisions` changelog under a
  **transaction-scoped advisory lock**, so revision assignment is serialized and its order
  matches commit order. We do **not** read "latest" as `max(revision)`. (Throughput-bounded but
  correct at this scale — a documented trade-off; commit-timestamp/`xmin` snapshotting is the
  escape hatch if the lock ever becomes a bottleneck.)
- **Consistency tokens ("zookies").** A write returns the new revision. `check()` accepts a
  token meaning **"evaluate against data at least as fresh as this revision."**
- **Zookie lifecycle (cross-actor safe).** A resource **stores the zookie of its last
  ACL/content change**; reads supply that stored token. This closes the canonical case where the
  ACL change and the content change are made by _different_ actors/services — the reader relies
  on the resource's stored token, not on holding the writer's token.
- **Two modes.** **Full consistency is the non-overridable default for state-changing /
  sensitive checks.** Bounded-staleness is an explicit, **audited** opt-in for high-throughput
  low-risk reads, with a stated max lag.
- **Context-aware caching.** Only **context-independent (pure ReBAC) sub-results** are cached,
  keyed by revision. Decisions whose derivation touched request context (ABAC) are **not cached
  by relation alone** — a cached `permit` must never bypass a later step-up/IP condition
  (see [ADR-008](008-pdp-trust-model.md)). Cache entries keyed by revision so a stale entry can't
  satisfy a fresher token.
- **Monotonicity across ops.** The revision must never regress across backup/restore, failover,
  or replica promotion (persist + fast-forward the high-water mark on recovery; never reuse a
  value). A startup check asserts non-regression.

## Consequences

### Positive

- Eliminates the new-enemy class of bugs by construction; correctness is explicit and testable.
- Callers trade freshness vs latency per call instead of globally.

### Negative / costs

- A revisioned tuple store, serialized revision assignment, and an ops runbook for monotonicity.
- Callers thread tokens for the strongest guarantee (the SDK does this for them).

## Alternatives considered

- **Sequence `max(revision)`** — rejected: allocation order ≠ commit order (the original bug).
- **Always fully consistent, no caching** — rejected: the PDP is on every request's hot path.
- **Commit-timestamp / `xmin` snapshotting** — viable and more concurrent; kept as the escape
  hatch if the advisory-lock throughput ceiling is hit.
- **Event-sourced authorization** — deferred: heavier; the revisioned store + outbox suffices.
