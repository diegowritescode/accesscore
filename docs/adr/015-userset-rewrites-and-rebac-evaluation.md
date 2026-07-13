# ADR-015: Userset rewrites — Zanzibar-style ReBAC evaluation (PDP v2)

- **Status:** Accepted (2026-07-13)
- **Date:** 2026-07-13
- The intellectual sequel to [ADR-012](012-pdp-evaluation-algorithm.md): it lifts the evaluator
  from "direct tuple + one userset level" to the `computedUserset` / `tupleToUserset` rewrites
  and nested groups that [ADR-002](002-authorization-model.md) promised, while keeping the pure,
  total, org-scoped core intact. Union-only; ABAC stays deferred.

## Context

[ADR-012](012-pdp-evaluation-algorithm.md) shipped a deliberately small v1: `evaluate` resolves a
grant through a **direct** tuple or **one** userset (group) level (`MAX_USERSET_DEPTH = 1`), role
hierarchy comes only from the action→relations UNION binding, and it explicitly ships **no**
`computedUserset` / `tupleToUserset` rewrites and **no** nested groups. It named the seams:
`MAX_USERSET_DEPTH` is the knob that unlocks nesting, and the shared resolver localizes where
rewrites hook in. Slice 4 spends those seams.

Three capabilities are missing and are the bread-and-butter of a real ReBAC system:

1. **Role aliasing on the same object** — "an `editor` is also a `viewer`" as a graph fact, not
   only as an action-binding coincidence. v1's action→relations UNION covers `document.read ⇐
viewer | editor | owner`, but it cannot express that `expand(document:1, viewer)` should
   _include_ the editors, nor that a relation can be **purely derived** from another.
2. **Hierarchy / inheritance** — "a `viewer` of a folder is a `viewer` of every document inside
   it." This needs a cross-object hop from a document to its `parent` folder and a resolution of a
   relation _there_.
3. **Nested groups** — "the `leads` group is a member of the `eng` group." v1 stops at one level;
   a member of a group nested inside a viewer group is silently denied
   ([ADR-012](012-pdp-evaluation-algorithm.md) documented this as a cost).

The inherited invariants are **not** re-decided and must survive: the evaluator stays **pure and
IO-free** ([ADR-011](011-pdp-core-location.md)), **org-scoped at every hop**
([ADR-007](007-tenancy-model.md)), **context-invariant by construction** — no `context` parameter,
no forgeable channel ([ADR-008](008-pdp-trust-model.md)) — and it consumes a snapshot resolved at a
**revision** under one read-only repeatable-read transaction
([ADR-004](004-authorization-consistency-model.md)). `check`/`expand` **agreement** must remain a
property, not a hope.

The boundary line for v2 is **union-only**. Zanzibar/OpenFGA rewrites also compose by
**intersection** and **exclusion** (difference), and [ADR-002](002-authorization-model.md)'s full
model adds explicit `forbid`s and ABAC **conditions**. Those are **deferred to Slice 5 (ABAC)**, and
the central design constraint of this ADR is that they must slot in **additively** — no storage
migration, no wire-contract break — when they arrive.

## Decision

**Model each relation's userset rewrite as a recursive operator tree (`Userset`) — the same shape
Zanzibar and OpenFGA use — stored as an optional JSONB field on `NamespaceConfig` (no DB migration,
backward-compatible), resolved at evaluation time (not materialized) by a generalized, still-pure
resolver over a namespace-aware snapshot, bounded by a raised `MAX_USERSET_DEPTH` plus the existing
visited-set.** v2 ships four node kinds — `this`, `computedUserset`, `tupleToUserset`, `union`;
`intersection` / `exclusion` are reserved and rejected at the write boundary until Slice 5.

### 1. Rewrite data model on `NamespaceConfig`

The core decision is the **shape**. A flat, implicitly-unioned list of leaf rules cannot express
`(A ∪ B) ∩ C` or `A − B`, so it would force a JSONB **and** contract change the moment intersection
or exclusion arrives — the opposite of additive. The industry-standard prior art is a recursive
**tree**: OpenFGA's `Userset` (`this` / `computedUserset` / `tupleToUserset` / `union` /
`intersection` / `difference`) and Zanzibar's `userset_rewrite` (union/intersection/exclusion of
child nodes). We adopt that tree now and populate only the v2-supported nodes:

```ts
type Userset =
  | { readonly kind: 'this' }
  | { readonly kind: 'computedUserset'; readonly relation: string }
  | { readonly kind: 'tupleToUserset'; readonly tupleset: string; readonly computedUserset: string }
  | { readonly kind: 'union'; readonly children: readonly Userset[] };

interface NamespaceConfigData {
  relations: string[];
  actions: Record<string, string[]>;
  rewrites?: Record<string, Userset>;
}
```

`Userset` lives in `authz/domain` (`userset.ts`) as the **single source of truth**. It is a pure
data shape with no behavior; publishing it to `@accesscore/contracts` for the SDK/console to author
namespaces is a deliberate **triggered follow-up** (§Consequences), not part of v2 — there is no
second consumer yet (the SDK only performs `check`), and adding a cross-package coupling before one
exists is exactly the premature generality [ADR-011](011-pdp-core-location.md) refuses.

Semantics, per node kind, resolving membership of a `target` subject in `object#relation`:

- **`this`** — the v1 behavior: a direct concrete tuple `object#relation@target`, or a userset
  (group) subject `object#relation@g#r` whose membership is resolved one hop deeper.
- **`computedUserset(relation: R2)`** — holders of `R2` on the **same** `object` also hold this
  relation (role aliasing: `viewer ⇐ editor`). Resolves `object#R2` recursively.
- **`tupleToUserset(tupleset: P, computedUserset: C)`** — for every object `O'` reached via a `P`
  tuple on `object` (`object#P@O'`), holders of `C` on `O'` also hold this relation (hierarchy:
  `document.viewer ⇐ viewer of the parent folder`). Resolves `O'#C` recursively — where `O'#C`'s own
  rewrites (from `O'`'s namespace) apply, giving arbitrary-depth folder trees.
- **`union(children)`** — grants if **any** child grants. The composition node; `expand` collects
  the union of all children's members.

A relation **absent** from `rewrites` behaves as `{ kind: 'this' }`, so every existing direct-only
config is unchanged (no migration; §Consequences). Worked example (a `document` namespace):

```ts
{
  relations: ['owner', 'editor', 'viewer', 'parent'],
  actions: { read: ['viewer'], write: ['editor'] },
  rewrites: {
    editor: { kind: 'union', children: [
      { kind: 'this' },
      { kind: 'computedUserset', relation: 'owner' },
    ] },
    viewer: { kind: 'union', children: [
      { kind: 'this' },
      { kind: 'computedUserset', relation: 'editor' },
      { kind: 'tupleToUserset', tupleset: 'parent', computedUserset: 'viewer' },
    ] },
  },
}
```

**Explicit-rewrite means exactly-defined.** If a relation _is_ present in `rewrites`, its tree is the
**complete** definition — direct tuples count **only** where a `this` node appears in the tree. A
relation can therefore be **purely derived** (e.g. `viewer: { computedUserset: editor }` ignores
direct `viewer` tuples). This is standard Zanzibar/OpenFGA semantics and a documented footgun:
authors who still want direct tuples must include `this`.

`toData()`/`fromData()` round-trip the field through JSONB unchanged; `toData()` **omits** `rewrites`
entirely when no relation declares one, so every Slice-3 row serializes byte-for-byte identically.
The namespace config already persists as a JSONB column ([ADR-005](005-persistence-and-orm.md)); an
**optional** JSON key is a pure serialization addition — **no DDL, no migration**. `fromData()` stays
validation-free and normalizes a missing entry to the implicit `this`, so **existing rows deserialize
and evaluate identically**. No top-level schema `version` field is introduced: the operator tree
evolves by **adding node kinds**, which is additive by construction, so a version tag would be
unused ceremony.

### 2. Build-time validation (extends `NamespaceConfig.create()`)

Validation stays in the `Result`-returning `create()` (the PAP maps a failure to a `400`,
[ADR-014](014-policy-administration-point.md) §4). New error codes join the existing set:

- `unknown_rewrite_relation` (**new**) — a `rewrites` **key**, a `computedUserset.relation`, or a
  `tupleToUserset.tupleset` that is not a declared relation of **this** namespace.
- `invalid_rewrite` (**new**) — a malformed node: a non-identifier relation name, or an empty
  `union.children`.
- `cyclic_computed_userset` (**new**) — a `computedUserset` cycle **within** the namespace
  (`R → R`, or `viewer → editor → viewer`). We build the same-namespace `computedUserset` edge graph
  across every relation's tree and reject any cycle statically. Such a cycle is always a no-op (the
  eval-time visited-set makes it harmless), but rejecting it at write time turns a silent
  never-grants config into a clear authoring error — a strictly better result than
  [ADR-012](012-pdp-evaluation-algorithm.md)'s "safe at runtime" floor, and cheap (one DFS).

**Deliberately not statically rejected:** `tupleToUserset.computedUserset` is a relation on the
**reached** object's namespace — a **different (often not-yet-defined) type** — so its existence
cannot be checked at this namespace's write time; we validate only that it is a well-formed
identifier. A **namespace-set-level** validator (resolve every cross-namespace `computedUserset`
against the org's full set of namespaces, detect cross-namespace cycles) is a real senior want but
belongs with the analyzer/playground (Slice 7), which has the whole set in hand; it is recorded as a
north-star follow-up, not a v2 gate. The cost — a typo in `computedUserset` silently yields no grant
— is stated in §Consequences.

The PAP DTO (`pap.dto.ts`, `defineNamespaceSchema`) is extended with a **recursive** zod schema for
`Userset` that admits **only** the four supported node kinds; an `intersection` / `exclusion` /
unknown node is a clean `400` at the edge ("not supported until Slice 5"), with the domain
`create()` errors as defense in depth (the two-layer story of
[ADR-014](014-policy-administration-point.md) §4).

### 3. Evaluation algorithm — one generalized, still-pure resolver

`derive` (the check path) and `collectMembers` (the `expand` path) generalize from "direct + one
userset" to "walk a relation's `Userset` tree." The snapshot becomes **namespace-aware**:

```ts
interface EvaluationSnapshot {
  readonly namespaces: NamespaceRegistry;
  readonly tuples: TupleIndex;
}
```

`NamespaceRegistry.get(type)` returns the `NamespaceDefinition | null` for an object type;
`rewritesFor(type, relation)` returns the relation's `Userset`, **defaulting to `{ kind: 'this' }`**
when the type has no namespace or the relation has no entry (graceful fallback — a reached object
whose type is undefined resolves via direct tuples only). `evaluate` reads
`namespaces.get(resource.type)` for the action→relations binding (v1 used the single `namespace`
field).

The resolver walks the tree, sketched (illustrative):

```ts
function derive(object, relation, target, snapshot, depth, visited): string[] | null {
  const node = nodeKey(object, relation);
  if (visited.has(node) || depth > MAX_USERSET_DEPTH) return null;
  visited.add(node);
  return resolve(
    object,
    relation,
    snapshot.namespaces.rewritesFor(object.type, relation),
    target,
    snapshot,
    depth,
    visited,
  );
}

function resolve(object, relation, rewrite, target, snapshot, depth, visited): string[] | null {
  switch (rewrite.kind) {
    case 'this':
      return resolveThis(object, relation, target, snapshot, depth, visited);
    case 'computedUserset':
      return derive(object, rewrite.relation, target, snapshot, depth, visited);
    case 'tupleToUserset':
      return resolveTupleToUserset(object, rewrite, target, snapshot, depth, visited);
    case 'union':
      return firstGrant(rewrite.children, (c) =>
        resolve(object, relation, c, target, snapshot, depth, visited),
      );
  }
}
```

- **`this`** — scan `tuples.subjectsOf(object, relation)`: a concrete subject equal to `target`
  grants (`grant.direct`); a userset subject recurses `derive(sub.ref, sub.relation, target, …,
depth + 1, …)` (`grant.userset`).
- **`computedUserset(R2)`** — recurse `derive(object, R2, target, …, depth, …)` on the **same**
  object (`grant.computed_userset`).
- **`tupleToUserset(P, C)`** — for each object subject `O'` in `tuples.subjectsOf(object, P)`,
  recurse `derive(O', C, target, …, depth + 1, …)` (`grant.tuple_to_userset`).
- **`union`** — `derive` returns the first granting child's path; `collectMembers` concatenates all
  children's members (deduped by `expand`).

**Depth accounting.** Depth starts at `0` at the resource node. A **userset (group) hop** and a
**`tupleToUserset` hop** each consume one unit (`depth + 1`) — these are the edges that move to a
new object and are the true source of unbounded walks and fan-out. A **`computedUserset`** hop and a
**`union`** node do **not** consume depth: they stay on the same object, over a finite relation set,
guarded by the visited-set — consuming depth there would arbitrarily cap legitimate role-alias chains
(`owner ⇒ editor ⇒ viewer`).

**Termination (over any finite snapshot).** The `TupleIndex` and each namespace's relation set are
finite, so the universe of `object#relation` **nodes** is finite. Every recursive step either
returns, or recurses into a strictly-not-yet-visited node (guarded by `visited` over
`object#relation`). Since `visited` grows monotonically over a finite universe, recursion terminates
**regardless of the depth cap**. `MAX_USERSET_DEPTH` is an **independent second bound** capping path
length against pathological fan-out. **Either guard alone guarantees termination** — exactly the
framing of [ADR-012](012-pdp-evaluation-algorithm.md) §3, now load-bearing across rewrites too.

**Org isolation across the `tupleToUserset` hop (the ADR-007 story).** The cross-object hop
introduces **no** new cross-org channel: `TupleIndex` is built org-scoped and drops foreign tuples
(`TupleIndex.of` filters by `orgId`), `loadClosure` only ever queries with `query.orgId`, and the
`NamespaceRegistry` holds only this org's namespaces. A hop to `folder:X#viewer` can only ever see
this org's `folder:X` tuples and this org's `folder` rewrites. The entry-point org guard in
`evaluate` (index org and every namespace org must equal `query.orgId`) remains as defense in depth.

**Explainability (`Reason`).** The `Reason` shape from [ADR-012](012-pdp-evaluation-algorithm.md) is
unchanged (`{ code, message, relation?, path? }`). New grant codes name the mechanism of the winning
branch: `grant.direct`, `grant.userset`, **`grant.computed_userset`**, **`grant.tuple_to_userset`**.
`path` remains the ordered list of **real, auditable tuple keys** along the winning derivation — for
a `tupleToUserset` grant it includes the tupleset tuple (`document:1#parent@folder:X`) followed by
the membership tuples on `folder:X#viewer`. We deliberately keep `path` as concrete stored-tuple
keys (auditable, verifiable) rather than inventing synthetic rewrite markers; the **code** carries
the mechanism. `collectMembers`/`expand` walk the identical tree, so **check/expand agreement holds
by shared traversal** — a subject appears in `expand(resource, R)` iff `derive` grants `R` on
`resource`.

### 4. Closure loading — iterative, multi-level, one transaction

`PdpService.loadClosure` must hand the pure resolver a **complete** snapshot: every `object#relation`
node the walk can reach within the depth cap, plus the namespaces needed to interpret their rewrites
— all inside the **single** read-only repeatable-read transaction
([ADR-004](004-authorization-consistency-model.md)). It becomes an iterative worklist to a fixpoint
that walks each node's `Userset` tree to discover the next frontier:

```
registry = new NamespaceRegistry(loaded lazily via findByNamespace, cached per type)
visited  = {}                      # object#relation already loaded
frontier = seed nodes at depth 0   # (resource, R) for each required/expanded relation
loaded   = []

while frontier is non-empty:
  next = {}
  for (O, R, d) in frontier where (O#R) not in visited and d <= MAX_USERSET_DEPTH:
    visited.add(O#R)
    rows = tuples.listByObject({ orgId, object: O, relation: R }, tx)
    loaded += rows
    walk the Userset tree of (O.type, R):                 # loads O.type's namespace on demand
      this:                    enqueue (s.ref, s.relation, d+1) for each userset subject s in rows
      computedUserset(R2):     enqueue (O, R2, d)
      tupleToUserset(P, C):    enqueue (O, P, d)                             # load parent pointers
                               enqueue (O', C, d+1) for each object subject O' already loaded on O#P
      union(children):         recurse into each child
  frontier = next
return loaded
```

Notes that make it correct and cheap:

- **Namespaces load lazily by type, cached** — reusing the existing
  `NamespaceDefinitionsRepository.findByNamespace`; **no new repository method**. An org with many
  namespaces pays only for the types the walk touches.
- **Each `object#relation` node loads at most once** (visited guard), so total DB reads are **linear
  in the number of distinct reachable nodes within depth D**, not exponential in fan-out.
- **`tupleToUserset` has a one-pass ordering dependency**: the reached `O'#C` nodes become
  enqueuable only after `O#P` is loaded, which the fixpoint loop handles naturally (they surface on
  the next pass; the visited guard prevents redundant loads).
- **`expand` now also builds the registry** — v1 passed `namespace: null`; v2 must load namespaces so
  the resolver can interpret rewrites during expansion.
- **Fail-closed at the bound.** Nodes discovered at depth `> MAX_USERSET_DEPTH` are not loaded; a
  grant that would require them is simply not provable ⇒ `default_deny`. When the walk truncates at
  the cap with no grant, the decision may carry an **advisory** `walk_truncated` reason (an extra
  entry in `reasons[]`, backward-compatible) so a deep-hierarchy denial is **observable** and does
  not read as a silent bug.

### 5. Depth cap: `MAX_USERSET_DEPTH = 10`

Raised from `1` to **`10`**. Rationale: realistic combined nesting — org → team → subteam group
chains (~3) plus folder → parent → grandparent hierarchies (~3–4) — sits comfortably under 10, while
10 still bounds worst-case path length and closure-loading breadth. It stays a **single domain
constant** (not env-configurable): the eval path must not grow a config-trust surface
([ADR-008](008-pdp-trust-model.md)), and changing the cap is a code change that re-runs the property
tests. A per-namespace cap is a possible future refinement (Alternative below); v2 keeps one global,
testable value. Behavior **at** the bound is fail-closed (§4).

### 6. Engine-optimized `batchCheck` — one shared snapshot

`batchCheck` stops being `Promise.all(requests.map(check))` (N transactions) and becomes **one**
read-only repeatable-read transaction serving up to **50** queries (the `batchCheckSchema` cap):

1. Read the committed high-water revision **once** (`revisions.current(tx)` → `revisionUsed`).
2. **Per-query consistency gating is preserved**: a query requesting `at-least R` is served from the
   shared snapshot iff `revisionUsed ≥ R`; otherwise that query alone denies with
   `consistency_unavailable`. Mixed tokens are correct — one snapshot at `revisionUsed` satisfies
   every query whose required revision it dominates.
3. A **shared `NamespaceRegistry`** and a **shared closure cache** (`object#relation → tuples`) are
   reused across all queries in the batch, so overlapping subgraphs (the same folder tree, the same
   groups) are loaded **once**: the batch pays for the **union** of the closures, not the sum.
4. **Per-query decision logging is preserved** — each query still emits its own decision-log record
   (subject/action/resource/effect/reasons/latency), all sharing the one `revisionUsed`.
5. Results stay **index-aligned** to the input.

This fits the same pure evaluation path (`loadClosure` + `evaluate`); the only change is sharing the
transaction, the revision read, the registry, and the closure cache. Because all queries read one
MVCC snapshot, the batch is also **internally consistent** — a property N independent transactions
did not give.

## Consequences

### Positive

- **Real ReBAC.** Role aliasing (`computedUserset`), hierarchy/inheritance (`tupleToUserset`), and
  nested groups (raised depth) — the Zanzibar subset [ADR-002](002-authorization-model.md) promised
  — now work and are **explainable** (mechanism in the code, real tuple chain in `path`).
- **ABAC is genuinely additive.** Because the rewrite is a real operator tree, Slice 5 adds
  `intersection` and `exclusion` (difference) as sibling node kinds and a `condition` annotation —
  each a new `kind` in the discriminated union plus a new resolver case — with **no** change to
  storage (optional JSONB), the closure loader's shape, or the wire contract. Union-now is a proper
  prefix of the target, not a throwaway.
- **No migration, fully backward-compatible.** An optional JSONB key; `toData` omits it when empty;
  `fromData` defaults to `this`; every existing direct-only config deserializes and evaluates
  **bit-for-bit identically**. A conformance test asserts it.
- **Stronger static validation than v1.** Same-namespace `computedUserset` cycles are rejected at
  write time (not merely made safe at runtime), turning a silent misconfig into an authoring error.
- **Termination is stronger by construction.** The visited-set over a finite node universe and the
  depth cap are two independent guarantees; either alone terminates — and now they cover the whole
  tree, not just group hops.
- **Cross-org isolation survives the new cross-object hop** by construction (org-scoped index +
  org-scoped reads + org-scoped registry), with the entry org guard as defense in depth.
- **check/expand agreement is retained** as a shared-traversal property under all node kinds.
- **`batchCheck` is genuinely batched** — one snapshot, one revision read, shared registry/closure —
  a real latency and consistency win over N transactions, with per-query gating and logging intact.

### Negative / costs

- **Read-time cost grows with graph depth and fan-out.** Bounded by the depth cap and visited-set,
  but a deep folder tree or large nested group is more work per `check` than v1's two-level load.
  `loadClosure` also **over-loads** — it materializes the full bounded closure, which may exceed the
  single winning path (the pure/IO separation of [ADR-011](011-pdp-core-location.md) is worth this).
- **Eval-time compute, not materialized derived tuples** — deep hierarchies pay on **every** read
  (Alternative below explains why we still prefer this).
- **Deep legitimate hierarchies fail-closed at the cap.** Above 10 combined hops a grant is denied;
  mitigated by the generous cap and the advisory `walk_truncated` reason for observability.
- **Shared-visited pruning can miss a grant on a depth-diamond (fail-closed).** The traversal's
  `visited` set is shared across `union` branches and never cleared. A node first reached deep
  (truncating its subtree at the cap) and later reachable by a shallower path is pruned on the
  shallow visit, so a grant the shallow path still had depth budget to prove is missed — a
  false-negative → deny. It is safe (it can only ever deny, never permit), requires a ≥10-deep
  diamond no realistic namespace approaches, and is already surfaced by `walk_truncated`. We keep
  the O(nodes) global `visited` (path-scoped detection risks exponential re-exploration, and a
  depth-aware fix would also have to span the closure loader) and pin the boundary with a
  regression test rather than build a memoizer nothing will trigger.
- **`tupleToUserset.computedUserset` is unvalidated at write time** (cross-namespace); a typo
  silently yields no grant, discoverable only at eval/test time or via the future analyzer/playground
  — until the namespace-set validator (Slice 7) lands.
- **More surface, more tests.** The registry, the fixpoint loader, and the tree-walking resolver are
  more complex than v1; they demand new property tests (termination, org isolation across the hop,
  check/expand agreement under rewrites, backward-compat, no-grant-beyond-cap).
- **Snapshot shape change** (`namespace` → `namespaces`) touches the `evaluate`/`expand` signatures,
  `PdpService`, and their tests — an internal domain change, not a public API change.

### Triggered follow-ups (deliberately out of v2)

- **Publish `Userset` (+ a namespace-definition write type) to `@accesscore/contracts`** when a
  second consumer authors namespaces (the admin console or an admin SDK surface). Today the SDK only
  performs `check`, so there is no consumer; extracting now would be premature coupling
  ([ADR-011](011-pdp-core-location.md)'s 2nd-consumer trigger; honors ADR-013's deferral of DTO
  convergence). Additive when it lands.
- **Namespace-set-level validation** (cross-namespace `computedUserset` existence + cross-namespace
  cycle detection) with the analyzer/playground (Slice 7).

## Alternatives considered

- **Flat, implicitly-unioned list of rules (`RewriteRule[]`) vs the operator tree** — **rejected in
  favor of the tree.** A flat list is simpler to ship, but it cannot represent intersection or
  exclusion, so adding them in Slice 5 would require transforming every stored JSONB config **and**
  breaking the PAP/contract shape — contradicting the additivity this ADR is built around. The tree
  (OpenFGA/Zanzibar's own model) makes Slice 5 two new node kinds and nothing else. The marginal
  extra complexity in v2 (a `union` node + a recursive walk) is the price of a non-breaking future,
  and it is small.
- **Materialize derived tuples at write time (rewrite-on-write) vs compute on read** — **rejected in
  favor of eval-time.** Materializing folder-inheritance into per-document tuples causes **write
  amplification** (one folder ACL change rewrites every descendant), makes the new-enemy/consistency
  story ([ADR-004](004-authorization-consistency-model.md)) far harder (derived tuples must stay
  transactionally consistent with their sources at a revision; a stale derived tuple is a correctness
  hazard), and turns a rewrite-rule change into a full re-materialization backfill. Eval-time keeps
  writes O(1) and centers correctness on the revisioned **source** tuples. This is the Zanzibar
  stance (check computes; materialized reverse indexes are a later optimization) — noted as a
  **future** optimization behind the same revision model if read latency ever demands it.
- **Full ABAC now (intersection / exclusion / conditions)** — **deferred to Slice 5**; the tree is
  shaped to absorb it additively (§Consequences). Conditions stay **outside** the pure ReBAC core:
  the resolver remains context-free (ADR-008 invariance, ADR-004 cacheable), and an ABAC layer
  **wraps** it — the rewrite tree yields the relationship closure, conditions/forbids **narrow** it
  ([ADR-002](002-authorization-model.md): `expand` is the closure, conditions restrict it).
- **Publish `Userset` to `@accesscore/contracts` in v2** — rejected: no second consumer exists yet
  (the SDK only checks), `apps/api` does not depend on the contracts package today, and adding the
  dependency + build-order coupling now buys nothing. Kept in the domain; extracted on the
  2nd-consumer trigger (§Triggered follow-ups).
- **Top-level config `version` field** — rejected as over-engineering: the operator tree evolves by
  adding node kinds (additive), so a version tag would never gate a read. JSONB makes adding one
  trivial later if a truly non-additive change ever appears.
- **Consume depth on `computedUserset` / `union`** — rejected: they stay on the same object over a
  finite relation set and are visited-guarded, so they cannot loop; charging them depth would cap
  legitimate role-alias chains for no termination benefit.
- **Statically reject only the direct self-loop `R = computedUserset(R)`** — superseded: we detect
  **all** same-namespace `computedUserset` cycles (the self-loop is the length-1 case) since the tree
  makes the edge graph explicit and the DFS is cheap. Cross-namespace cycles remain for the
  set-level validator (Slice 7).
- **Synthetic rewrite markers in `path`** — rejected: `path` stays a list of real stored-tuple keys
  (auditable and verifiable against the store); the reason **code** names the mechanism instead.
- **Load all org namespaces into the registry up front** — rejected for **lazy-by-type** loading via
  the existing `findByNamespace`: same one-transaction guarantee, reuses the current port (no new
  method), and only touches the types the walk actually reaches.
- **Per-namespace / env-configurable depth cap** — deferred: one global domain constant is testable
  and keeps a config-trust surface off the eval path; a per-namespace bound can be added later.
- **Keep `batchCheck` as N transactions** — rejected: N× transaction and revision-read overhead, no
  cross-query consistency, and no chance to share the closure. One snapshot is strictly better and
  preserves per-query gating and logging.
- **Unbounded userset recursion** — rejected as in [ADR-012](012-pdp-evaluation-algorithm.md): the
  cost/cycle risk is real; a generous bounded cap (10) plus the visited-set covers realistic nesting
  and keeps the worst case bounded and testable.

## Implementation notes per US

One PR per issue; each maps to a slice of this design.

- **US-4.0 (#56) — data model + validation + PAP DTO (no evaluator change).** Add the `Userset` tree
  (`authz/domain/userset.ts`) and the optional `rewrites` field to `NamespaceConfigData`; extend
  `NamespaceConfig.create()` with the new error codes (`unknown_rewrite_relation`, `invalid_rewrite`,
  `cyclic_computed_userset`) including same-namespace `computedUserset` cycle detection; make
  `fromData` default a missing entry to `{ this }` and `toData` omit an empty `rewrites`; add a
  `rewritesFor(relation)` accessor. Extend `defineNamespaceSchema` (`pap.dto.ts`) with a recursive
  zod schema admitting only the four supported node kinds (`400` on `intersection`/`exclusion`/
  unknown), with `create()` as defense in depth. **No DB migration.** Ship a backward-compat test: a
  direct-only config deserializes and evaluates identically.
- **US-4.1 (#57) — `computedUserset` in `evaluate`/`expand` + `loadClosure`.** Introduce
  `NamespaceRegistry`; change `EvaluationSnapshot` to `{ namespaces, tuples }`; have `evaluate` bind
  the action via `registry.get(resource.type)`. Add tree-walking to `derive`/`collectMembers` with
  the `computedUserset` case (same-object, same-depth) and `union`. In `PdpService`, build the
  registry lazily in `loadClosure` and pass it in `check` **and** `expand` (drop `namespace: null`);
  enqueue `(object, R2)` at the same depth. Reason code `grant.computed_userset`. Properties: editors
  are permitted `read` and appear in `expand(_, viewer)`; check/expand agreement.
- **US-4.2 (#58) — `tupleToUserset` in `evaluate`/`expand` + `loadClosure` (cross-org isolation).**
  Add the `tupleToUserset` case to the resolver (per reached object subject, recurse `O'#C` at
  `depth + 1`) and to the loader (enqueue `(O, P, d)` then `(O', C, d + 1)`). Reason code
  `grant.tuple_to_userset`; `path` = tupleset tuple + reached membership tuples. Property: a
  foreign-org parent can **never** grant (org-scoped index/reads/registry).
- **US-4.3 (#59) — nested depth.** Raise `MAX_USERSET_DEPTH` `1 → 10`; convert `loadClosure` to the
  iterative fixpoint worklist with a visited-set over `object#relation` (load each node at most once);
  fail-closed at the bound with the advisory `walk_truncated` reason. `fast-check` properties:
  termination over a finite snapshot, dedup, depth monotonicity, and no-grant-beyond-cap.
- **US-4.4 (#60) — shared-snapshot `batchCheck`.** Replace the N-transaction implementation with one
  read-only repeatable-read transaction: read the revision once; per-query consistency gating
  (`revisionUsed ≥ required` else `consistency_unavailable`); a shared `NamespaceRegistry` and shared
  closure cache across the ≤ 50 queries; per-query decision-log records sharing `revisionUsed`;
  index-aligned results.
