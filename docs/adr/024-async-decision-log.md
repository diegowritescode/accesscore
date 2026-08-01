# ADR-024: Asynchronous, batched decision log

- **Status:** Accepted (2026-08-01)
- **Date:** 2026-08-01
- Move the `decision_log` write off the authorization hot path: buffer entries in a bounded
  in-memory queue and flush them as one multi-row `INSERT` on an interval / size trigger, degrading
  to a synchronous write under backpressure. Completes the p99 story that
  [ADR-023](023-decision-cache-consistency-model.md) started, within the audit trust model of
  [ADR-021](021-tamper-evident-audit.md).

## Context

`POST /authz/check` writes one `decision_log` row per decision, synchronously, before returning.
The k6 harness (`docs/performance.md`) measured ~22 ms per check, dominated by two Postgres
round-trips: the tuple-snapshot load and this insert.

[ADR-023](023-decision-cache-consistency-model.md) removed the snapshot load on a cache hit — a hit
skips the read transaction and the graph walk entirely. That makes the log write the **floor of
every check**: hits and misses alike still pay one write round-trip, and it is now the single
largest remaining term. The same cost is multiplied in `batchCheck`, where a batch of 50 queries
shares one read transaction (ADR-015 / US-4.4) but still issues 50 separate inserts.

The write is also the one place where the hot path takes a write lock on a table that
[ADR-018](018-least-privilege-db-role.md) deliberately keeps append-only (`INSERT` only for the
runtime role), so batching is available to us without loosening any grant.

Two properties constrain how far we may go:

1. **Audit completeness.** Every returned decision must be logged, including decisions served from
   the decision cache. Dropping entries under load is not acceptable.
2. **Tamper-evidence is a separate stream.** [ADR-021](021-tamper-evident-audit.md) deliberately
   keeps `decision_log` **off** the SHA-256 hash chain; the low-volume `security_audit` table is the
   tamper-evident stream and its appends are serialized under `pg_advisory_xact_lock`. Any
   durability we trade here must be traded only against the un-chained, high-volume stream.

## Decision

Write the decision log **asynchronously in batches**, behind a bounded in-memory buffer with a
synchronous-degradation escape valve.

1. **Two ports instead of one.** The hot-path port stays exactly what the PDP needs —
   `DecisionLog.record(entry)`, one decision at a time. A second, batch-native port
   `DecisionLogSink.recordBatch(entries)` is what persistence implements: `DrizzleDecisionLog` now
   only implements the sink, as a single multi-row `INSERT`. `PdpService` is unchanged and unaware
   of buffering.

2. **`BufferedDecisionLog` is the `DecisionLog` adapter.** `record` appends to an in-memory array
   and returns; a flush is triggered by **size** (`DECISION_LOG_FLUSH_BATCH_SIZE`, default 500 rows
   — also the maximum rows per statement), by **interval**
   (`DECISION_LOG_FLUSH_INTERVAL_MS`, default 1000 ms, on an `unref`'d timer), and on **shutdown**.
   A flush drains the buffer in batch-size slices; concurrent triggers collapse onto one in-flight
   drain (single-flight), so an entry is never written twice.

3. **Backpressure degrades, it never drops.** At the high-watermark
   (`DECISION_LOG_BUFFER_SIZE`, default 10 000 entries) `record` stops buffering and writes that
   entry **synchronously** — trading the latency win back for completeness, which is the property
   worth keeping. Because that write is awaited, a failing store still propagates into `check` →
   503 → deny at the PEP: under a sustained Postgres outage the buffer fills and the endpoint
   returns to today's fail-closed behaviour rather than silently accumulating unlogged decisions.

4. **Graceful shutdown flushes.** `AuthzModule` implements `OnApplicationShutdown` and closes the
   writer (stop the timer, drain until empty, including entries recorded _while_ draining).
   `main.ts` already calls `enableShutdownHooks()`, and Nest invokes module shutdown hooks in
   reverse module order — `AuthzModule` before `DbModule` closes the pool.

5. **The durability trade, stated plainly.** A crash (`SIGKILL`, OOM, power loss) loses the
   un-flushed window: at most `DECISION_LOG_FLUSH_INTERVAL_MS` of decisions. This is acceptable
   **only** because of ADR-021's split: `decision_log` is the high-volume analytics/forensics
   stream and is not hash-chained, so no ordering, tamper-evidence or non-repudiation property is
   weakened. `security_audit` appends stay synchronous and serialized — security events are never
   buffered.

6. **Ordering is by decision time, not insertion time.** Every record already carries `createdAt`
   and `revisionUsed` stamped when the decision was made, and the existing
   `decision_log_org_created_idx` is on `(org_id, created_at)`. Batching — and an interleaved
   degraded write landing physically before older buffered rows — therefore cannot reorder the log
   semantically. Readers order by `created_at`; physical insertion order carries no meaning.

7. **A failed flush drops its batch, loudly.** The batch is counted as
   `authz_decision_log_records_total{outcome="dropped"}` and logged at error level; it is not
   retried and not requeued. Rationale: a poison batch would otherwise be retried forever, and
   requeueing under a sustained outage grows memory until the high-watermark converts the failure
   into the fail-closed path anyway (point 3), which is the better signal. Durable retry belongs to
   the outbox relay (see alternatives), not to an in-process buffer.

8. **Metrics live in the adapter; decision metrics stay real-time.** `MeteredDecisionLog` remains
   the **outermost** decorator, so `authz_decisions_total` / `authz_decision_duration_seconds` are
   still observed the moment a decision is made, not when its row lands. Buffer-internal signals
   can only be observed from inside the buffer, so `BufferedDecisionLog` depends on
   `MetricsService` directly: `authz_decision_log_buffer_depth`,
   `authz_decision_log_records_total{outcome=flushed|degraded|dropped}` and
   `authz_decision_log_flush_lag_seconds` (age of the oldest entry in a batch).
   [ADR-022](022-observability-metrics.md)'s constraint still holds — the domain and application
   layers carry no dependency on the metrics library.

9. **`DECISION_LOG_ASYNC=false` restores the previous behaviour** exactly, via a pass-through
   `ImmediateDecisionLog` (the null-object pattern already used for the decision cache): every
   record is written straight through as a one-row batch, and the check fails closed if that write
   fails. An operator who wants synchronous durability keeps it with one variable.

## Consequences

### Positive

- The check hot path no longer contains a database **write**. Combined with ADR-023, a cache hit is
  now one `MAX(revision)` read and nothing else — no transaction, no walk, no insert.
- `batchCheck` collapses N inserts into (at most) one statement, compounding the shared-snapshot
  win from US-4.4.
- Write amplification against an append-only table drops by up to `flushBatchSize`× : fewer
  transactions, fewer WAL records, less index churn on `(org_id, created_at)`.
- Backpressure, lag and loss are **observable** (`buffer_depth`, `flush_lag_seconds`,
  `records_total{outcome}`) rather than implicit — an operator can alert on
  `outcome="degraded"` (buffer saturated) or `outcome="dropped"` (log loss) directly.
- No migration, no schema change, no new infrastructure: the buffer is in-process and the toggle is
  a boolean.

### Negative / costs

- **Bounded loss window.** Up to one flush interval of decisions is lost on an ungraceful stop, and
  a failed flush loses its batch. Mitigated by the ADR-021 split (the tamper-evident stream is
  unaffected), the shutdown flush, and the `dropped` counter.
- **A log-write failure no longer fails the check closed** until the buffer fills. This is a real
  weakening versus the synchronous path and is the reason point 3 exists rather than dropping on
  overflow.
- **Memory.** `DECISION_LOG_BUFFER_SIZE` × record size is the ceiling (~10 000 entries ≈ a few MB);
  it is a bound, not a reservation.
- **The log is now eventually consistent.** Anything asserting on `decision_log` immediately after
  a decision must flush first — the e2e suite calls `flush()` explicitly, which also documents the
  asynchrony.
- **Per-instance buffers.** Horizontal scaling multiplies the loss window by instance count; it
  does not change its duration.

## Alternatives considered

- **Keep the write synchronous** — rejected: after ADR-023 it is the hot path's floor cost, paid
  even by cache hits, and it is a write on every read-only authorization decision.
- **Fire-and-forget `void decisionLog.record(...)`** — rejected: no batching (still N round-trips),
  unbounded concurrency against the pool, no backpressure, and unhandled rejections. A buffer is
  the same win with a bound and an error path.
- **Route through the existing `outbox` table + a relay** (`FOR UPDATE SKIP LOCKED`) — rejected
  _for this slice_: it replaces one synchronous insert with another synchronous insert on the hot
  path, so it does not solve the measured problem; it buys durable retry we do not need for an
  un-chained stream. The relay is the right home for durable delivery when EventBridge lands
  (ADR-025's changelog is the same seam), and it can consume this port later.
- **Postgres `COPY`** — rejected: a multi-row `INSERT` is already one round-trip for the batch
  sizes involved; `COPY` would add a streaming code path and drizzle escape hatches for marginal
  gain.
- **Buffer in Redis / an external queue** — rejected: it makes the log path depend on a second
  system's availability and introduces a second at-least-once delivery story for a stream that is
  deliberately non-authoritative.
- **Drop entries when the buffer is full** (classic ring-buffer overwrite) — rejected: audit
  completeness is the property we are protecting; degrading to synchronous writes preserves it and
  makes the pressure visible instead of silent.
- **`UNLOGGED` table or time partitioning for `decision_log`** — orthogonal and deferred: both
  address retention/WAL volume rather than per-request latency, and `UNLOGGED` would trade crash
  safety for the whole table rather than for a one-second window.
