# AccessCore — Performance

A claim like "the PDP is fast" is worthless without a number, a method, and the conditions it
was measured under. This document records a reproducible load test of the authorization hot path
and, more importantly, **what the numbers mean** — where the time goes and why.

## What is measured

The two endpoints a consumer service hits on every protected request:

- `POST /authz/check` — one authorization decision (walks the ReBAC graph: direct →
  `computed_userset` → `tuple_to_userset` → nested groups).
- `POST /authz/batch-check` — many decisions against one consistent snapshot in a single
  round-trip.

The load uses the seeded demo tenant: the principal is the **owner** of `document:onboarding` and
resolves `document.read` through the `owner → editor → viewer` rewrite chain — a representative
multi-hop walk, not a trivial direct hit.

## Method

- **Tool:** [k6](https://k6.io) — [`apps/api/perf/authz.k6.js`](../apps/api/perf/authz.k6.js).
- **Profile:** constant VUs per endpoint, 20 s each, run back-to-back — `VUS=30` by default,
  `VUS=5` for the unsaturated service-time measurement below.
- **Harness:** `docker compose up` (Postgres 16, Redis 7) + the API as a local Node process with
  the in-process `software` signer. Rate limiting is raised for the run (`THROTTLE_LIMIT`) — the
  goal is to measure the decision path, not the throttler, which is exercised by its own tests.
- **Environment:** a developer laptop (Apple Silicon, 10 cores, 16 GB), API + Postgres + Redis all
  on one host. These are **relative** figures for reasoning about cost and headroom and a
  reproducible method — not a production hardware benchmark. Absolute latency on a dedicated,
  network-separated deployment will differ.

Reproduce:

```bash
docker compose up -d postgres redis
pnpm --filter @accesscore/api run build
pnpm --filter @accesscore/api run db:migrate && node apps/api/dist/seed.js
# start the API (software signer, relaxed throttle) on :3000, then:
TOKEN=$(curl -s -XPOST localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"demo@accesscore.dev","password":"correct horse battery staple"}' | jq -r .access_token)
TOKEN=$TOKEN pnpm --filter @accesscore/api run perf
```

## The v1 baseline

The first recorded run — before the Scale-ring work — at 30 VUs, 0.00% HTTP errors:

| Endpoint                                  | p50     | p95     | p99     | max    | Throughput         |
| ----------------------------------------- | ------- | ------- | ------- | ------ | ------------------ |
| `POST /authz/check`                       | 21.6 ms | 28.8 ms | 34.1 ms | 90 ms  | ~1,330 req/s       |
| `POST /authz/batch-check` (20 checks/req) | 105 ms  | 121 ms  | 133 ms  | 191 ms | ~5.3 ms / decision |

k6 thresholds (`check` p95 < 100 ms, `batch-check` p95 < 300 ms, error rate < 1%) pass, so the
script doubles as a local regression gate.

**The graph walk was never the cost.** The evaluator is a pure, in-memory function that resolves
this graph in well under a millisecond (it is the same code the mutation suite hammers). The time
went to two Postgres round-trips per decision: the tuple-snapshot load and the synchronous
decision-log write. That measurement is what defined the Scale-ring slices — first the
[revision-keyed decision cache](adr/023-decision-cache-consistency-model.md) (removes the snapshot
load on a hit), then the [async batched decision log](adr/024-async-decision-log.md) (removes the
write from the request path).

## Measuring the change: a configuration matrix

Comparing "before and after" on a laptop is unreliable if you run each configuration once — the
first run of a pair is measurably different from the second. So the two features were measured as a
**matrix**, alternating configurations and repeating the whole sequence twice (12 runs), at two load
levels. The tables below are the **median of the two repetitions**; the repetitions agreed within
~10% on every cell except where noted.

The `v1` row below is a **fresh re-run** of that configuration (both features off), not the
historical figure above. The two were measured in different sessions — different background load, and
a `decision_log` that had since grown by hundreds of thousands of rows — and the re-run is slower in
absolute terms (35 ms vs 22 ms at 30 VUs). That is the point of the matrix: compare rows **within**
it, never across sessions.

The two load levels answer different questions:

- **5 VUs — service time.** The stack is far from saturated, so latency ≈ the work one request
  actually does.
- **30 VUs — saturated.** The local stack (API + Postgres + Redis on one host) is the bottleneck, so
  latency is dominated by **queueing** and the interesting number is really throughput.

`POST /authz/check` latency, p50 / p95 / p99:

| Configuration                             | 5 VUs (service time)    | 30 VUs (saturated)       |
| ----------------------------------------- | ----------------------- | ------------------------ |
| v1 — sync log, no cache                   | 5.2 / 7.8 / 11.5 ms     | 35.4 / 48.8 / 68.4 ms    |
| \+ async batched log (ADR-024)            | 4.8 / 6.6 / 16.6 ms     | 32.7 / 41.8 / 54.7 ms    |
| \+ decision cache as well (ADR-023 + 024) | **1.3 / 3.3 / 10.5 ms** | **6.8 / 10.3 / 15.2 ms** |

`POST /authz/batch-check` (20 decisions per request), p50 — and the same figure per decision:

| Configuration             | 5 VUs                    | 30 VUs                   |
| ------------------------- | ------------------------ | ------------------------ |
| v1 — sync log, no cache   | 20.4 ms (1.02 ms/dec)    | 152.5 ms (7.6 ms/dec)    |
| \+ async batched log      | 13.0 ms (0.65 ms/dec)    | 100.1 ms (5.0 ms/dec)    |
| \+ decision cache as well | **5.8 ms (0.29 ms/dec)** | **29.4 ms (1.5 ms/dec)** |

Completed harness iterations per second (both scenarios, 40 s run) — the throughput view:

| Configuration             | 5 VUs        | 30 VUs       |
| ------------------------- | ------------ | ------------ |
| v1 — sync log, no cache   | 573 /s       | 507 /s       |
| \+ async batched log      | 641 /s       | 604 /s       |
| \+ decision cache as well | **1,785 /s** | **2,572 /s** |

## What the numbers mean

- **The v1 "22 ms" was mostly queueing, not work.** The same v1 code serves a check in **~5 ms** at
  5 VUs. Both figures are honest; they answer different questions, and quoting the saturated one as
  "the cost of a check" would have been wrong. This is why the matrix has two load levels.
- **The async log's own contribution is exactly where the mechanics predict.** Removing one insert
  from a ~5 ms request buys ~8% at the median (5.2 → 4.8 ms), but removing **20** inserts from a
  batch buys **36%** (20.4 → 13.0 ms) — the batch endpoint was paying N writes for one shared
  snapshot. Under saturation it also lifts throughput ~19% (507 → 604 /s), because each request
  holds a pool connection for less time.
- **It costs p99 jitter at low load, and that is visible.** At 5 VUs the async p99 is _worse_ —
  16.6 ms vs 11.5 ms — because a 500-row flush is one lump of work on the same event loop, and the
  request unlucky enough to share a tick with it pays for it. At 30 VUs the inversion disappears
  (54.7 vs 68.4 ms): the baseline's own queueing is by then larger than the jitter. This is the
  `DECISION_LOG_FLUSH_BATCH_SIZE` trade — fewer round-trips against more work per flush — and it is
  tunable per deployment rather than assumed.
- **The two slices compose, and the cache is the bigger lever.** Together: **5.2 → 1.3 ms** at the
  median unsaturated (4×), **35.4 → 6.8 ms** saturated (5.2×), and **507 → 2,572** iterations/s
  (5.1×). That is the expected shape — a hit skips the read transaction, the graph walk _and_ the
  write, leaving one `MAX(revision)` read.
- **Batching still amortizes the fixed cost.** Even with both features on, `batch-check` resolves a
  decision for **0.29 ms** versus 1.3 ms for an individual call — the reason the endpoint exists.

## Why this is not a CI gate

The k6 script carries thresholds and is meant to be run locally or on demand against a
`docker compose` stack. It is intentionally **not** wired into `verify`: shared CI runners have
non-deterministic CPU/IO, which turns latency thresholds into flakes and makes absolute numbers
meaningless. Performance here is a property to measure deliberately and reason about, not a
per-commit pass/fail.
