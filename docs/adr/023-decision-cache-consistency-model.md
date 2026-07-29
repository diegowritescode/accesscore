# ADR-023: Decision cache — revision-keyed, consistency-safe result caching

- **Status:** Accepted (2026-07-28)
- **Date:** 2026-07-28
- Cache authorization decisions in Redis, keyed by the global consistency revision, caching only
  context-independent (pure ReBAC) decisions — so a cache can never serve a stale `permit` across a
  write (new-enemy) or bypass a later step-up. Realises the "context-aware caching" clause that
  [ADR-004](004-authorization-consistency-model.md) promised, within the trust model of
  [ADR-008](008-pdp-trust-model.md).

## Context

`POST /authz/check` is on every protected request's hot path. A load test (`docs/performance.md`)
measured ~22 ms per check, dominated by two Postgres round-trips: the per-request tuple-snapshot
load (`PdpService.loadClosure`, one query per walked node) and the synchronous decision-log write.
The graph evaluation itself is a sub-millisecond pure function.

Caching an authorization decision is dangerous if done naively. Two correctness hazards must be
preserved:

1. **New-enemy ([ADR-004](004-authorization-consistency-model.md)).** After access is removed and
   sensitive content added, a stale cached `permit` must never be served.
2. **No stale step-up bypass ([ADR-008](008-pdp-trust-model.md), `docs/security.md`).** A decision
   gated by an ABAC condition (`aal`, IP, time) must never be served from a cache keyed by
   (principal, action, resource) alone — a cached `permit` could bypass a later MFA/IP requirement.

AccessCore already has the primitive that makes safe caching possible: a single **global,
commit-ordered revision** advanced by every tuple / policy / namespace write under a
transaction-scoped advisory lock ([ADR-004](004-authorization-consistency-model.md)).
`RevisionsRepository.current()` reads the committed high-water mark.

## Decision

Cache `check` and `batchCheck` results in Redis behind a `DecisionCache` port, **keyed by the
global revision**, caching **only context-independent (pure ReBAC) decisions**.

1. **Cacheability = zero applicable policies.** A decision is cached iff, at evaluation time, there
   are no applicable policies for `(orgId, resourceType, action.verb)`. In that case the final
   decision equals the pure ReBAC result — verified in code: `decide` returns the ReBAC decision
   unchanged when the policy set is empty, and the live `applyBounds` is a no-op (`bounds =
UNBOUNDED`). Any applicable policy means the decision depends on request context (`aal` / `ip` /
   `now`) and is **never cached**. This is the direct guarantee against a stale step-up bypass.

2. **Key = (orgId, subject, action, resource, revision).** The Redis key string is built inside the
   adapter as `authz:dec:v1:{orgId}:{revision}:{base64url(sha256(subject | action | resource))}`.
   `orgId` and `revision` stay in clear (tenant isolation is visible, entries are inspectable); the
   SHA-256 of the `\x1f`-delimited triple bounds key length and prevents delimiter injection. The
   value stores `{effect, reasons, revision}`; on read, a value whose stored revision does not match
   the key's revision is treated as a miss (defence-in-depth).

3. **The revision is the invalidator; invalidation is implicit.** GET is keyed by `R_now` (the
   current global high-water, read authoritatively from Postgres without a transaction); SET is
   keyed by the revision the evaluation actually used (`revisionUsed`, monotonically `>= R_now`).
   Writes are **never actively evicted** — any authz write advances the global revision, so
   subsequent checks compute a new key namespace and stale entries become unreachable and TTL-expire.
   This also covers "a policy appeared": the write advanced the revision, so a formerly-cacheable
   pure-ReBAC entry is never served after policy state changes — no re-query of policies on a hit.

4. **Consistency modes key by `R_now`, never by the requested token.** Full consistency (the
   default) reads `R_now` and serves a hit at `R_now` — fresh as of request admission. Bounded
   staleness (`at-least`) bypasses the cache in this slice and always evaluates authoritatively (a
   rare, audited opt-in; caching it safely against the same `R_now` entry is a documented future
   refinement). The revision is sourced from Postgres, never Redis: Redis is not commit-ordered, so
   trusting it for a fresh read would reintroduce new-enemy.

5. **Fail-safe, not fail-open.** Any cache read/write error, corrupt value, or revision mismatch is
   treated as a miss and falls through to the authoritative evaluation (which itself fails closed →
   503 → deny at the PEP). A cache fault can only ever cause an extra authoritative evaluation,
   never a wrong `permit`. Redis is never a decision availability SPOF.

6. **The decision log is still written on cache hits.** The audit guarantee — every decision is
   logged — is preserved; the cached value carries the reasons, so the log entry is complete.
   (Moving that write off the hot path is a follow-up slice; it does not affect this decision.)

Config: `DECISION_CACHE_ENABLED` (default `true`; a pure toggle backed by a null-object cache when
off) and `DECISION_CACHE_TTL_SECONDS` (default `60`; a memory / staleness bound, not the correctness
mechanism — that is the revision in the key).

## Consequences

### Positive

- New-enemy-safe and step-up-safe **by construction**: the revision-in-key and the zero-policy gate
  are each independently sufficient, and both are property-tested (caching never changes a decision
  versus the uncached path, including across an interleaved write).
- Cache hits skip the multi-query closure walk and the read transaction entirely (one cheap
  `MAX(revision)` read, no transaction), directly attacking the measured hot-path cost.
- Implements ADR-004's "context-aware caching" clause with no new consistency concept.

### Negative / costs

- **Global granularity:** one write in any org advances the shared revision and logically flushes
  the cache. Fine for the single-tenant demo (high hit rate between writes); it degrades under high
  multi-tenant write rates. Escape hatch (deferred, not built): per-object / per-namespace versions
  folded into the key — Zanzibar's per-object approach — which reuses the future Watch changelog.
- **Full reads still pay one `MAX(revision)` round-trip** (the price of a commit-ordered source);
  only bounded-staleness reads could later be served fully from Redis within a lag budget.
- A cache miss now performs two revision reads (`R_now` outside the transaction, `revisionUsed`
  inside); a hit performs one and opens no transaction. The tradeoff favours the hit-dominated hot
  path.

## Alternatives considered

- **Key by (principal, action, resource) without a revision** — rejected: cannot be invalidated on
  write; reintroduces new-enemy and stale step-up. The exact anti-pattern `security.md` warns against.
- **Source the current revision from Redis for a pure-Redis hit path** — rejected for full reads:
  Redis is not commit-ordered, so it is either ahead of an uncommitted write or behind a committed
  one — both new-enemy violations. Viable only for bounded-staleness reads; kept as a future option.
- **Cache ABAC decisions keyed additionally by (aal, ip, now)** — rejected: `now` makes the key
  unique per request (zero hit rate) and risks encoding a step-up bypass; the zero-policy gate is
  simpler and safe.
- **Active per-write invalidation (DEL affected keys)** — rejected: requires tracking each decision's
  read-set; the revision-in-key achieves invalidation for free.
- **Per-object versioning now (full Zanzibar)** — deferred: needs a maintained per-object version and
  read-set tracking; over-engineered for the current single global revision. Documented as the escape
  hatch when hit rates demand it.
