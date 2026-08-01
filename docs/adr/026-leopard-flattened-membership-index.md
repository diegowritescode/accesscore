# ADR-026: Leopard-style flattened membership index

- **Status:** Accepted (2026-08-01). **Implementation:** the index tables and the asynchronous
  materializer ship in this slice; the evaluator read path that consults them lands next.
- **Date:** 2026-08-01
- Materialize the transitive closure of **positive set membership** into
  `flattened_memberships`, refreshed **asynchronously** from the relationship-tuple changelog
  ([ADR-025](025-watch-api-and-tuple-changelog.md)), with a per-set **`valid_at_revision`
  watermark** that makes a stale index unable to change any decision — only unable to accelerate it.

## Context

A `check` that resolves through nested groups walks the relationship graph per request:
`PdpService.loadClosure` issues one query per walked `object#relation` node, so a chain of nested
groups costs a query per level. The Scale ring has removed the other two hot-path costs — the
decision cache ([ADR-023](023-decision-cache-consistency-model.md)) short-circuits whole decisions
and the batched decision log ([ADR-024](024-async-decision-log.md)) removed the write — but a **cold
cache entry still pays the traversal**, and the traversal is the part that grows with the customer's
group hierarchy rather than with our traffic.

Zanzibar's answer is **Leopard**: a separate, denormalized index of flattened set membership,
maintained asynchronously, consulted only when it is fresh enough to be safe. The properties that
make it safe are not incidental — they are the whole design.

## Decision

### 1. Index exactly the sets the evaluator asks about

The evaluator recurses on set membership in exactly one place: when a tuple's subject is a **userset**
(`group:eng#member`), `deriveThis` asks "is the query subject a member of this set?". So the index
stores, per set `(object, relation)`, the transitive closure of its members — and the **candidate
sets are precisely those referenced as userset subjects** in the org's tuples
(`SELECT DISTINCT subject … WHERE subject LIKE '%#%'`). That definition is self-limiting: it indexes
what will be asked and nothing else, and it shrinks automatically when a userset stops being
referenced (the materializer removes those sets).

### 2. The closure is computed by the evaluator's own traversal

`flatten(object, relation, snapshot)` is a new export of `authz/domain/evaluate.ts`, built on the
**same** `collectMembers` machinery that `expand` already uses — the collect family now carries a
depth alongside each member, and `expand` is a projection of `flatten`. Reusing one traversal is the
point: a second, independent closure implementation in the materializer would be free to diverge from
the evaluator, and a divergence between "what the index says" and "what evaluation would say" is a
wrong authorization decision. One implementation, one semantics, tested together.

### 3. Materialization is asynchronous, fed by the changelog

Recomputing in the write transaction was rejected: **one tuple write can change the closure of
exponentially many ancestor sets**, so a synchronous rebuild would put unbounded write amplification
on the administrative write path — and that path already holds the advisory lock that serializes
revision allocation. Instead a background `MembershipIndexer` drains the tuple changelog from a
durable cursor (`index_cursors`) and rebuilds what changed.

### 4. Full recompute per changed organization, not incremental deltas

For each org that appears in the drained changelog page, the indexer loads the org's tuples and
namespaces, then recomputes **every** candidate set's closure and replaces its rows.

Incremental maintenance was rejected deliberately. Maintaining a transitive closure incrementally is
easy for insertions and genuinely hard for deletions and for non-monotonic rewrites (`intersection`
and `exclusion` can _remove_ members from an ancestor when a descendant changes). Getting that wrong
produces a **stale positive membership**, i.e. a wrong permit. A full recompute is obviously correct
by construction, and correctness here is a security property, not a performance one.

The cost is bounded: an org with more than `MEMBERSHIP_INDEX_MAX_TUPLES_PER_ORG` tuples is **skipped
and logged**, leaving its index stale — which is safe, because a stale index is simply not used
(§5) and the live walk remains authoritative. The escape hatch, if that bound is ever reached in
practice, is precise inverse-dependency tracking (which sets depend on which nodes) so only affected
sets are recomputed.

### 5. The watermark is the safety mechanism

Each set records `valid_at_revision`: the global revision the materializer had caught up to when it
recomputed that set. The read path may consult a set **only if `valid_at_revision >= the revision the
request requires`** (full consistency: the current high-water mark; bounded staleness: the token's
revision). Therefore:

- A stale index **cannot** cause the new-enemy problem — it fails the gate and the evaluator walks
  live. Staleness can only cost performance, never correctness.
- A namespace or policy change, which alters closures without touching a tuple, also invalidates the
  index implicitly: it advances the global revision, so every watermark falls behind until the
  indexer recomputes. No separate invalidation path is needed — the same mechanism as ADR-023.

**Read the high-water mark before computing, then stamp with it.** The materializer reads
`revisions.current()` first and stamps that value, so the closure it writes always reflects data at
least as fresh as the stamp. Under-claiming freshness is safe; over-claiming would serve a stale
permit. (The Watch heartbeat in ADR-025 has the same ordering requirement for the same reason.)

### 6. Depth is stored per member, because the live walk is bounded

The live evaluator truncates at `MAX_USERSET_DEPTH`. If the index reported a member reachable in 8
hops while the live walk had only 3 hops of budget left, using it would turn a truncated deny into a
permit — the fail-**open** direction. So each row stores the **minimum hop count** from the set to
the member, and a hit is usable only when that depth fits the remaining budget. Storing depth is what
makes the read path's gate exact instead of approximate.

### 7. Derived state, deliberately mutable — and deliberately not new attack surface

Unlike `decision_log`, `revisions`, `security_audit` and `relation_tuple_changelog`, these tables are
a **cache**: they are rewritten on every refresh, so they carry no append-only `REVOKE`
([ADR-018](018-least-privilege-db-role.md) still applies to the others).

They are, however, **trusted input to the evaluator**, so it is worth stating what that does and does
not change: an attacker who can write to the index with the runtime role could manufacture a permit —
but that same attacker could equally write a relationship tuple and manufacture the same permit. The
index adds no privilege that the tuple table did not already grant. What protects both is the
least-privilege role boundary and the fact that neither is reachable from the HTTP surface.

### 8. One indexer at a time, with no coordination service

The whole tick runs in one transaction guarded by `pg_try_advisory_xact_lock`. A second instance that
cannot take the lock **skips its tick** and tries again later. No leader election, no external lock
service, no duplicated work — and because the tick is one transaction, the index is never observed
half-rebuilt.

### 9. How it composes with the decision cache

The two accelerate different things: the cache is a **whole-decision** shortcut (keyed by the
decision's inputs), the index is a **membership sub-walk** shortcut. Both are revision-gated, which
means both are usable only when nothing has been written since they were populated. So the index's
real contribution is _cold-cache_ checks during quiescent periods and bounded-staleness reads — not a
second win on the same request the cache already answers. Stating that plainly is more useful than
implying they multiply.

Config: `MEMBERSHIP_INDEX_ENABLED` (default `true`), `MEMBERSHIP_INDEX_INTERVAL_MS` (2000),
`MEMBERSHIP_INDEX_CHANGE_PAGE_SIZE` (500), `MEMBERSHIP_INDEX_MAX_TUPLES_PER_ORG` (50 000).

## Consequences

### Positive

- Deep nested-group membership becomes a single indexed lookup instead of one query per level — the
  cost that grows with the customer's hierarchy rather than with our traffic.
- The safety argument is **structural**, not procedural: the revision gate makes a stale index
  unusable, and the depth column makes the bound exact. There is no code path where "the index was
  behind" becomes "the wrong answer".
- One traversal implementation serves evaluation, `expand`, and materialization, so they cannot
  drift apart.
- No new infrastructure: Postgres tables, a background timer, and an advisory lock.

### Negative / costs

- **Write amplification moved, not removed.** A single tuple write causes a full recompute of the
  org's candidate sets on the next tick. Bounded by the tuple ceiling and paid off the request path,
  but it is real work, and a write-heavy org will spend most ticks recomputing an index its own
  writes keep invalidating.
- **Only useful during quiescence** (§9), like the decision cache, because the revision is global.
  Per-object versioning is the same escape hatch ADR-023 documented.
- **Positive membership only.** The index accelerates set membership; it does not flatten ABAC
  conditions, and the evaluator still resolves `intersection`/`exclusion` and conditions live. That
  is exactly Zanzibar's Leopard scoping, and it is a limit, not an oversight.
- **Storage grows with the closure, not the tuples** — a member of a deeply nested group appears once
  per ancestor set. Pathological hierarchies inflate the index; the tuple bound is the blunt guard.
- The whole tick is one transaction, so a large org's refresh holds a write transaction for its
  duration. Acceptable at this scale; the escape hatch is per-set transactions once precise
  invalidation exists.

## Alternatives considered

- **Compute the closure with a recursive CTE at query time** — rejected, and it is the closest
  alternative: it would collapse N round-trips into one without any staleness to reason about. But it
  would re-implement the rewrite semantics (`computedUserset`, `tupleToUserset`, union, intersection,
  exclusion, the depth bound, the cycle guard) **in SQL**, beside the pure evaluator that already
  defines them. Two semantics for one question is precisely the divergence this ADR's §2 exists to
  prevent, and the evaluator is the most safety-critical code in the system.
- **Incremental closure maintenance** — rejected for this slice (§4): the deletion and non-monotonic
  cases are where it goes wrong, and the failure mode is a stale permit.
- **A Postgres materialized view** — rejected: `REFRESH MATERIALIZED VIEW` cannot express the rewrite
  tree, offers no per-set watermark, and its refresh is all-or-nothing across tenants.
- **Index every relation, not just referenced usersets** — rejected: most relations are never asked
  as a membership question, so it would multiply storage and refresh cost for no read benefit. The
  referenced-userset rule indexes exactly the questions the evaluator asks.
- **Keep the flattened closure in memory (or Redis) instead of Postgres** — rejected: it would need a
  warm-up path on every deploy, and the watermark must be transactionally consistent with the data it
  describes, which is exactly what a table in the same database gives for free.
- **Leader election for the indexer** (etcd/Redis lock) — rejected as unnecessary infrastructure: a
  transaction-scoped advisory lock in the database that already holds the data is sufficient, and it
  releases itself if an instance dies mid-tick.
