# Observability

AccessCore emits three complementary signals: **structured logs**, an **append-only decision
log**, and **Prometheus metrics**. This document covers the metrics floor (see ADR-022).

## Endpoints

| Endpoint       | Auth | Purpose                                         |
| -------------- | ---- | ----------------------------------------------- |
| `GET /health`  | open | Liveness.                                       |
| `GET /ready`   | open | Readiness (dependencies reachable).             |
| `GET /metrics` | open | Prometheus scrape target (text format `0.0.4`). |

`/metrics` is unauthenticated and throttling-exempt, matching standard scrape-target practice; it
exposes only aggregate counters and process gauges — no tenant data. Restrict it at the network
layer in production.

## Metrics

### Runtime (default)

Node/process metrics from `prom-client` `collectDefaultMetrics` — event-loop lag, heap usage, GC,
open handles — all under the `service="accesscore"` label.

### HTTP

- `http_request_duration_seconds{method,route,status_code}` — histogram of request latency for
  every route (`route` = `Controller.handler`). Recorded by a global interceptor.

Derive rate, errors and latency (RED) from this series, e.g.:

```promql
# p95 latency of the authorization check endpoint
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket{route="AuthzController.check"}[5m])) by (le))
```

### Authorization domain

The signal unique to this service — the rate and outcome of the decisions it exists to make:

- `authz_decisions_total{effect}` — counter of PDP decisions, `effect` = `permit` | `deny`.
- `authz_decision_duration_seconds{effect}` — histogram of PDP evaluation latency.

```promql
# permit rate over the last 5 minutes
sum(rate(authz_decisions_total{effect="permit"}[5m]))
  / sum(rate(authz_decisions_total[5m]))
```

These are emitted by a `MeteredDecisionLog` decorator around the `DecisionLog` port, so the pure
evaluator and the `PdpService` orchestrator carry no dependency on the metrics library (ADR-022).

## Scraping

Point Prometheus at the deployment:

```yaml
scrape_configs:
  - job_name: accesscore
    metrics_path: /metrics
    static_configs:
      - targets: ['accesscore-api:3000']
```

## Deferred: distributed tracing

OpenTelemetry tracing is intentionally deferred until there is a second service to correlate
across (the outbox relay → EventBridge). Today a correlation ID (`x-request-id`) threads one
request through the logs; adopting OTel later is additive and does not change this metrics floor.
