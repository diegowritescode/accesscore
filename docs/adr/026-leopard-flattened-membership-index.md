# ADR-026: Leopard-style flattened membership index

- **Status:** Accepted (2026-08-01). The read path and the per-organization freshness gate were
  added on 2026-10-01; sections 5 and 6 describe the shipped design.
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

An org is recomputed when the tick sees a **tuple change** for it in the changelog **or a namespace
change** (a `namespace_definitions` row whose revision falls in the tick's window). Namespace edits
never reach the tuple changelog, yet a rewrite change alters closures, so the materializer reads both.

**Sets whose closure crosses an `exclusion` are not indexed.** A member of `base − subtract` is
proven by a positive path through `base` _and_ by the absence of a path through `subtract`. The
stored depth only measures the first; the live walk, starting deeper, might run out of budget while
proving the second and deny (fail-closed) where the index would permit. Rather than encode the cost
of a negative proof, the materializer leaves such sets out (`flattenSet(...).monotonic === false`)
and the evaluator walks them live. `intersection` stays indexable: every operand is a positive proof,
and the stored depth is the deepest of them.

### 5. The watermark is the safety mechanism, gated per organization

Each set records `valid_at_revision`: the revision the materializer had caught up to when it
recomputed that set. The read path consults the index **only if `valid_at_revision` is at least the
organization's version** — the newest revision of any tuple change (from the changelog) or namespace
change for that organization, read **inside the check's own repeatable-read snapshot**. Therefore:

- A stale index **cannot** cause the new-enemy problem. Any change to the organization's graph that
  the check can see advances the organization's version past the watermark, the gate fails, and the
  evaluator walks live. Staleness can only cost performance, never correctness.
- A namespace change, which alters closures without touching a tuple, invalidates the index the same
  way: it advances the organization's version.
- Policy writes do not affect membership closures, so they do not count toward the version.

**Why per organization, not the global revision.** Revisions are global (one counter for every
tenant). Gating on the global high-water mark would make every organization's index unusable after
_any_ tenant's write, so under steady multi-tenant traffic the index would almost never be fresh.
Tenants cannot affect each other's closures, so each one is versioned by its own changes.

**Why the snapshot's version, not the request's consistency token.** A bounded-staleness request
(`at-least`) still evaluates the tuples at the snapshot it reads. Gating the index on the token's
older revision would combine an older membership closure with newer tuples — a state that never
existed at any single revision, which is exactly how a removed member could keep a grant made after
the removal. The gate is therefore the same for both consistency modes.

**Stamp with a revision the closure is at least as fresh as.** The materializer stamps each set with
the end of the window it processed: the later of the high-water mark read before the changelog page
and the newest change in that page (only the newest change, when the page is full). Every change at or below that revision has committed — revision allocation is
serialized by an advisory lock held until commit — and the closure is computed afterwards, so it
reflects data at least as fresh as the stamp. Under-claiming freshness is safe; over-claiming would
serve a stale permit. (The Watch heartbeat in ADR-025 has the same ordering requirement for the same
reason.)

### 6. The read path: one member-to-sets lookup per check

Zanzibar's Leopard answers "is U in S?" by intersecting the sets S expands to with the sets U belongs
to. The read path does the same with one lookup: the first time a check's walk reaches a userset
subject, `PdpService` loads **every indexed set the checked subject belongs to**
(`flattened_memberships_member_idx` on `(org_id, member_type, member_id)`), reads the organization's
version only if that returned anything, keeps the entries whose watermark passes the gate, and caches
that view for the rest of the transaction. Checks that resolve
directly never pay for it.

The view is used in two places, with the same rule:

- **The closure loader** skips loading a userset's subtree when the subject is an indexed member
  within the remaining depth budget — this is where the queries are saved.
- **The evaluator** (`deriveThis`) grants through such a membership with reason
  `grant.indexed_userset`. Its `path` holds the stored tuple that references the set; the hops
  below it are summarized by the index rather than listed.

**Positive answers only.** An entry that is absent, stale, or deeper than the remaining budget means
"walk live", never "deny". The index can therefore only replace a live walk that would have found the
same membership. A property test pins this: over random group graphs with rewrites, evaluating with
a fresh index never changes the decision.

`expand` always walks live: it must list members, not answer a membership question.

### 7. Depth is stored per member, because the live walk is bounded

The live evaluator truncates at `MAX_USERSET_DEPTH`. If the index reported a member reachable in 8
hops while the live walk had only 3 hops of budget left, using it would turn a truncated deny into a
permit — the fail-**open** direction. So each row stores the **minimum hop count** from the set to
the member, and a hit is usable only when that depth fits the remaining budget. Storing depth is what
makes the read path's gate exact instead of approximate.

### 8. Derived state, deliberately mutable — and deliberately not new attack surface

Unlike `decision_log`, `revisions`, `security_audit` and `relation_tuple_changelog`, these tables are
a **cache**: they are rewritten on every refresh, so they carry no append-only `REVOKE`
([ADR-018](018-least-privilege-db-role.md) still applies to the others).

They are, however, **trusted input to the evaluator**, so it is worth stating what that does and does
not change: an attacker who can write to the index with the runtime role could manufacture a permit —
but that same attacker could equally write a relationship tuple and manufacture the same permit. The
index adds no privilege that the tuple table did not already grant. What protects both is the
least-privilege role boundary and the fact that neither is reachable from the HTTP surface.

### 9. One indexer at a time, with no coordination service

The whole tick runs in one transaction guarded by `pg_try_advisory_xact_lock`. A second instance that
cannot take the lock **skips its tick** and tries again later. No leader election, no external lock
service, no duplicated work — and because the tick is one transaction, the index is never observed
half-rebuilt.

### 10. How it composes with the decision cache

The two accelerate different things: the cache is a **whole-decision** shortcut (keyed by the
decision's inputs), the index is a **membership sub-walk** shortcut. The cache is keyed by the
**global** revision, so any tenant's write orphans every entry; the index is gated by the
**organization's** version, so it keeps serving a tenant while other tenants write. The index's real
contribution is therefore _cold-cache_ checks and checks during other tenants' write traffic — not a
second win on the same request the cache already answers. Stating that plainly is more useful than
implying they multiply.

Config: `MEMBERSHIP_INDEX_ENABLED` (default `true`), `MEMBERSHIP_INDEX_INTERVAL_MS` (2000),
`MEMBERSHIP_INDEX_CHANGE_PAGE_SIZE` (500), `MEMBERSHIP_INDEX_MAX_TUPLES_PER_ORG` (50 000).

## Consequences

### Positive

- Deep nested-group membership becomes a single indexed lookup instead of one query per level — the
  cost that grows with the customer's hierarchy rather than with our traffic.
- The safety argument is **structural**, not procedural: the revision gate makes a stale index
  unusable, the depth column makes the bound exact, and only positive answers are used. There is no
  code path where "the index was behind" becomes "the wrong answer".
- At most two small queries per check that reaches a userset (the subject's sets, then the
  organization's version), independent of how deep the hierarchy is.
- One traversal implementation serves evaluation, `expand`, and materialization, so they cannot
  drift apart.
- No new infrastructure: Postgres tables, a background timer, and an advisory lock.

### Negative / costs

- **Write amplification moved, not removed.** A single tuple write causes a full recompute of the
  org's candidate sets on the next tick. Bounded by the tuple ceiling and paid off the request path,
  but it is real work, and a write-heavy org will spend most ticks recomputing an index its own
  writes keep invalidating.
- **Only useful while the organization is quiescent.** A tenant's own write makes its index stale
  until the next tick (`MEMBERSHIP_INDEX_INTERVAL_MS`). Per-set versioning (inverse dependencies) is
  the escape hatch.
- **A negative answer still walks live**, now one lookup heavier. Using negatives would need the cost
  of the proof of absence, which the index does not record (§4, exclusion).
- **The organization's version reads the changelog.** A future changelog retention job (ADR-025) must
  keep each organization's newest entry, or the version could move backwards and pass a stale gate.
- The `path` of an indexed grant stops at the set; the full chain is available from `expand` or by
  disabling the index.
- **Positive membership only.** The index accelerates set membership; it does not flatten ABAC
  conditions, and the evaluator still resolves `intersection`/`exclusion` and conditions live. That
  is exactly Zanzibar's Leopard scoping, and it is a limit, not an oversight.
- **Storage grows with the closure, not the tuples** — a member of a deeply nested group appears once
  per ancestor set. Pathological hierarchies inflate the index; the tuple bound is the blunt guard.
- The whole tick is one transaction, so a large org's refresh holds a write transaction for its
  duration. Acceptable at this scale; the escape hatch is per-set transactions once precise
  invalidation exists.

## Alternatives considered

- **Gate on the global revision** — rejected (§5): correct, but any tenant's write would disable
  every tenant's index.
- **Gate a bounded-staleness request on its token's revision** — rejected (§5): it would mix a closure
  from one revision with tuples from another.
- **Look up each reached set individually** — rejected for one member-to-sets query (§6): per-node
  lookups would add a round trip at every level of exactly the deep hierarchies the index is for.

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
