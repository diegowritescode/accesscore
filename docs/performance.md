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
- **Profile:** 30 constant VUs per endpoint, 20 s each, run back-to-back.
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

## Results

Measured on the environment above (single run, 0.00% HTTP errors):

| Endpoint                                  | p50     | p95     | p99     | max    | Throughput         |
| ----------------------------------------- | ------- | ------- | ------- | ------ | ------------------ |
| `POST /authz/check`                       | 21.6 ms | 28.8 ms | 34.1 ms | 90 ms  | ~1,330 req/s       |
| `POST /authz/batch-check` (20 checks/req) | 105 ms  | 121 ms  | 133 ms  | 191 ms | ~5.3 ms / decision |

k6 thresholds (`check` p95 < 100 ms, `batch-check` p95 < 300 ms, error rate < 1%) pass, so the
script doubles as a local regression gate.

## What the numbers mean

- **A single `check` is ~22 ms, but the graph walk is not the cost.** The evaluator is a pure,
  in-memory function that resolves this graph in well under a millisecond (it is the same code the
  mutation suite hammers). The ~22 ms is dominated by the **synchronous decision-log write** and
  the per-request tuple-snapshot load — one Postgres round-trip each. That is a deliberate
  correctness choice (every decision is durably logged for audit before it is returned), and it is
  the obvious first optimization if throughput ever needs it (async/batched decision log, cached
  snapshots keyed by the consistency revision).
- **Batching amortizes the fixed cost.** `batch-check` resolves 20 decisions in ~105 ms — about
  **5.3 ms per decision, ~4× cheaper** than 20 individual calls — because the snapshot load and
  round-trip are paid once for the whole batch. This is exactly why the endpoint exists, and the
  measurement confirms the design pays off.

## Why this is not a CI gate

The k6 script carries thresholds and is meant to be run locally or on demand against a
`docker compose` stack. It is intentionally **not** wired into `verify`: shared CI runners have
non-deterministic CPU/IO, which turns latency thresholds into flakes and makes absolute numbers
meaningless. Performance here is a property to measure deliberately and reason about, not a
per-commit pass/fail.
