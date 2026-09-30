# ADR-025: Watch API — a durable relationship-tuple changelog, streamed over SSE

- **Status:** Accepted (2026-08-01). **Implementation:** complete — the durable changelog and the
  SSE `GET /authz/watch` endpoint both ship in this slice.
- **Date:** 2026-08-01
- Record every relationship-tuple mutation into an append-only `relation_tuple_changelog` in the
  **same transaction** as the tuple write and its revision allocation, cursored by the global
  revision from [ADR-004](004-authorization-consistency-model.md); stream it to consumers over
  **Server-Sent Events**, where `Last-Event-ID` _is_ "resume from this revision".

## Context

Zanzibar's `Watch` exists because consumers of an authorization system need to know **what
changed**, not just what is currently true: to invalidate a per-object cache entry, to materialize a
flattened membership index (the Leopard-style index planned as the next slice), to drive a live admin
console, and eventually to publish authorization events to other services.

AccessCore cannot answer that question today. `relation_tuples` is a **current-state** table:

- `upsert` uses `onConflictDoUpdate` and overwrites `revision` — the previous revision is gone.
- `delete` **hard-deletes** the row — a revoked grant leaves no trace at all.

So the most security-relevant change of all — _access was removed_ — is invisible after the fact,
and "give me everything that changed since revision N" cannot be served by scanning
`relation_tuples.revision`: it would miss every deletion and every overwritten intermediate state.

What already exists and should be reused rather than duplicated: the **global, commit-ordered
revision** allocated under a transaction-scoped advisory lock (ADR-004), which is also the zookie a
writer already receives.

## Decision

### 1. A durable changelog, written in the same transaction (outbox pattern)

`relation_tuple_changelog(org_id, revision, op, namespace, object_id, relation, subject,
recorded_at)`. `RelationTupleWriter` appends to it inside the existing unit of work, after
`revisions.allocate` and the tuple mutation. Atomicity is the whole point: a committed tuple change
**always** has its changelog entry, and a rolled-back write leaves neither (covered by an
integration test that fails the tuple write and asserts both the changelog and `revisions` are
empty).

The append lives in the **application** layer, not inside the store adapter, because the ordering
guarantee — revision, then mutation, then changelog, one transaction — is a use-case invariant and
belongs where it can be read.

### 2. The cursor is the global revision, not a new sequence

No new ordering concept: the revision is already commit-ordered (ADR-004) and already what a client
holds as a zookie, so "resume from where my consistency token was" needs no translation. `since({
orgId, afterRevision, limit })` returns changes strictly after the cursor, ordered by revision.

**Revision space is sparse, and consumers must expect gaps.** Namespace and policy writes consume
revisions without touching a tuple, and a revoke that matched nothing consumes one too. A gap means
"nothing you care about happened at that revision", never "you missed an event".

### 3. The changelog is the tombstone

Deletions are recorded as `op='delete'` rather than soft-deleting `relation_tuples`. The alternative
— a `deleted_at` column — would put a filter predicate on the PDP's hottest read path
(`listByObject`, executed once per walked node per check) to serve a history question. History goes
in the history table; current state stays a clean current-state table.

### 4. Only real state changes are recorded

An `upsert` always records (it always changes the row's revision). A `revoke` records **only if it
deleted a row**; a revoke of a tuple that was never granted still advances the revision (unchanged
behaviour — the write path stays uniform) but appends nothing. The changelog therefore means "state
changed here", which is what a consumer converging on state needs; it is not an attempted-write
audit.

### 5. Append-only, enforced by the runtime role — but not hash-chained (yet)

The migration `REVOKE UPDATE, DELETE ON relation_tuple_changelog` from `PUBLIC` and
`accesscore_app`, so the application role can append and read but never rewrite history
([ADR-018](018-least-privilege-db-role.md)); an integration test asserts all three grants.

That is **prevention, not detection**: unlike `security_audit`
([ADR-021](021-tamper-evident-audit.md)), the changelog is not a SHA-256 hash chain, so a
higher-privileged actor could rewrite it undetected. Worth stating plainly, because tuple
administration is not in the tamper-evident stream today either — this is a **pre-existing** gap
that the changelog now makes cheap to close: revision allocation is _already_ serialized by the
advisory lock, so chaining these entries would not add a new serialization point, only one read of
the previous hash on the (cold) administrative write path. Tracked as a follow-up, deliberately not
bundled into this slice.

### 6. Composite primary key, no surrogate id

PK `(org_id, revision, namespace, object_id, relation, subject)`. It is simultaneously (a) the
uniqueness constraint that makes a replayed append idempotent, (b) the exact index the read pattern
wants — `WHERE org_id = ? AND revision > ? ORDER BY revision` uses it as a prefix — and (c) the
natural dedup key for at-least-once consumers.

### 7. Transport: Server-Sent Events, `GET /authz/watch`

SSE, not gRPC or long-polling:

- **`Last-Event-ID` is the resume cursor.** The browser and any conforming client resend the last
  event id on reconnect, so setting `id` on every event makes reconnection _exactly_ "resume after
  this point" with no bespoke protocol. It takes precedence over `?since=` for that reason.
- **It passes the infrastructure we already run** — plain HTTP/1.1 through the existing Nginx/
  Dokploy edge, no HTTP/2 requirement, no separate port, no proxy configuration.
- **Native consumers on both sides:** `EventSource` in the Next.js console, a plain `fetch` stream
  in the Node SDK.
- **gRPC stays the escape hatch** for high-fanout internal consumers (bidirectional flow control,
  binary framing) if a real one appears; it would read the same changelog through the same port.

**The event id is a consistency token, not a raw revision.** Revisions are opaque outside the system
by design (ADR-004 exposes them only as zookies), so each event's `id` is
`ConsistencyToken.fromRevision(...)`. That buys a genuinely useful property: the cursor a consumer
resumed from is directly usable as a `check` consistency token — "read at exactly the point I have
seen".

**Two named events.** `change` carries the mutation; `heartbeat` keeps proxies from closing an idle
connection **and doubles as a cursor advance** — it carries the current high-water mark, so a
consumer that reconnects after a quiet period does not rescan the revisions in between. Advancing on
a heartbeat is only safe because the high-water mark is read **before** the changelog page: read the
other way round, a change committing between the two reads would be skipped (there is a unit test
pinning exactly that order).

**Change detection is polling, not `LISTEN`/`NOTIFY`.** Each stream re-queries the changelog on an
interval (`WATCH_POLL_INTERVAL_MS`, default 500 ms, bounded page of `WATCH_PAGE_SIZE`), draining a
full page immediately rather than waiting. Rationale: the query is an index prefix scan on the
primary key, PAP write rates are low, and polling needs no dedicated connection, no
reconnect-and-resubscribe logic, and no second delivery path to reason about. `LISTEN`/`NOTIFY` (or
a Redis fan-out) is the documented escape hatch if sub-100 ms propagation is ever required — it
would only change _when_ the same query runs.

**Open streams do not block a shutdown.** Node's `server.close()` waits for open connections, so a
five-minute stream would otherwise stall every redeploy. `AuthzModule`'s shutdown hook closes the
stream service, and each generator checks that flag once per tick — so streams end within one poll
interval and clients reconnect against the new instance.

Delivery is **at-least-once**: a reconnect may replay the tail, and consumers dedup on
`(id, tuple key)` — which the primary key mirrors. **Backpressure is a bounded stream lifetime**
rather than an unbounded server-side queue: the generator is pulled lazily and never reads more than
one page ahead, and every stream closes after `WATCH_MAX_STREAM_SECONDS` (default 300) so a client
that has stopped reading cannot make the server accumulate indefinitely. Because `Last-Event-ID`
resumption is automatic in `EventSource`, that cap is invisible to well-behaved clients — it is the
standard SSE lifetime pattern, and it also sidesteps idle-timeout behaviour in proxies. Streams are
tenant-scoped: `orgId` comes from the verified token, never from a parameter, and the endpoint is
**owner-gated** (`PapAdminGuard`) because following every relationship change in an organization is
an administrative capability.

## Consequences

### Positive

- Deletions become observable — the one change that matters most for authorization is no longer
  invisible after the fact.
- One mechanism serves four consumers: per-object cache invalidation (the escape hatch ADR-023
  documented), the Leopard index's async materialization, the live console, and the EventBridge seam
  (a relay draining this table with `FOR UPDATE SKIP LOCKED` → RabbitMQ).
- No new ordering primitive, no new consistency concept, and the cursor is a value clients already
  hold.
- Atomic with the write it describes, so there is no "event without a change" or "change without an
  event" window to reason about.

### Negative / costs

- **One extra INSERT per tuple write.** The administrative write path pays for the read path's
  ability to follow changes. Acceptable: PAP writes are orders of magnitude rarer than checks, and
  the write already holds an advisory lock and a transaction.
- **Unbounded growth.** The changelog only grows. Pruning is **deferred and must not be naive**: a
  retention watermark has to respect the slowest live consumer's cursor and any index that would
  need to replay history to rebuild. Documented here rather than half-built.
- **Not tamper-evident** (see decision 5) — prevention only, with the follow-up named.
- **Sparse cursor space** is a real consumer-facing subtlety: a client that treats a cursor gap as a
  lost event will loop forever. Called out explicitly in `docs/api.md`.
- **Polling latency.** A change surfaces within one poll interval (~500 ms by default), not
  instantly, and every open stream costs two cheap queries per tick. Acceptable for cache
  invalidation, index materialization and a live console; the `LISTEN`/`NOTIFY` escape hatch is
  named above if that ever stops being true.
- **A bounded stream lifetime is a visible protocol detail** for non-`EventSource` clients: a hand-
  rolled consumer that does not resend `Last-Event-ID` will silently stop receiving changes after
  five minutes. Documented in the endpoint description and `docs/api.md`.

## Alternatives considered

- **Scan `relation_tuples` by revision** — rejected, and this is the crux: it cannot see deletions
  (the row is gone) and `onConflictDoUpdate` destroys intermediate revisions. It would silently
  report only additions, which for an authorization system is the _unsafe_ direction of wrong.
- **Soft-delete `relation_tuples` (`deleted_at`)** — rejected: it moves a history concern onto the
  PDP's hottest read query, and every reader would need the predicate to stay correct. One missing
  `WHERE deleted_at IS NULL` is a revoked grant that still permits.
- **Reuse the generic `outbox` table** — rejected: the outbox is a _delivery queue_
  (`published_at`/`attempts`, rows drained and eventually pruned) for one publisher, with no org
  scoping and no revision cursor. The changelog is a _replayable history_ that several independent
  consumers read at their own cursors. A relay can later publish _from_ the changelog; that is the
  correct direction of dependency.
- **Postgres logical decoding / CDC (Debezium-style)** — rejected for this system: it moves the
  contract into the physical schema (every column rename becomes a consumer-visible break), needs
  replication slots and an external component in an otherwise self-contained deployment, and gives
  no tenant scoping or revision semantics. The application knows what a _domain_ change is; WAL
  does not.
- **Database triggers writing the changelog** — rejected: it hides a load-bearing invariant from the
  code that owns it, cannot be unit-tested with the rest of the write path, and would have to
  re-derive the revision the application already allocated.
- **A dedicated changelog sequence** — rejected: a second ordering would have to be reconciled with
  the revision on every read, and a bare sequence is not commit-ordered — the exact bug ADR-004
  fixed with the advisory lock.
- **Long-polling or WebSockets instead of SSE** — long-polling re-establishes state per request and
  has no standard resume header; WebSockets add a bidirectional protocol (and Nginx upgrade
  handling) for a stream that only ever flows server→client. SSE is the smallest thing that
  satisfies the requirement, and `Last-Event-ID` is the feature that makes it fit.
