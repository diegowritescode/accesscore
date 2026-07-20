# ADR-022: Observability floor — Prometheus metrics

- **Status:** Accepted (2026-07-19)
- **Date:** 2026-07-19
- Expose runtime and **authorization-domain** metrics in Prometheus format so the service is
  observable in production, without coupling the PDP or the domain to the metrics library.

## Context

AccessCore already emits structured logs (pino + correlation IDs, ADR from Slice 2.5) and an
append-only `decision_log` (ADR-004). Logs answer "what happened on this request"; they do not
answer "what is the permit/deny rate right now" or "what is the PDP's latency distribution" —
the questions an operator or an SLO dashboard asks. The sibling spine project (MiniLedger) already
ships a Prometheus `/metrics` floor; AccessCore should reach at least parity, and go further with
metrics specific to an authorization service.

## Decision

Add a small `observability` module exposing an open **`GET /metrics`** endpoint in Prometheus
text format:

- **Process/runtime** — `collectDefaultMetrics` (event-loop lag, heap, GC, handles) under a
  `service="accesscore"` default label.
- **HTTP** — `http_request_duration_seconds` histogram, labelled by `method`, `route`
  (`Class.handler`) and `status_code`, recorded by an `APP_INTERCEPTOR`
  (`HttpMetricsInterceptor`) so every route is covered without per-controller wiring.
- **Authorization domain (beyond parity)** — `authz_decisions_total{effect}` (permit/deny volume)
  and `authz_decision_duration_seconds{effect}` (PDP evaluation latency). These are the signal
  unique to this service: the rate and outcome of the decisions it exists to make.

**No PDP change.** The domain metrics are emitted by a **`MeteredDecisionLog` decorator** around
the existing `DecisionLog` port. The `record(entry)` seam already carries `effect` and
`latencyMs`, so the decorator increments the counter and observes the histogram, then delegates to
the real `DrizzleDecisionLog`. `authz.module` composes the two in the `DECISION_LOG` factory; the
pure evaluator and the `PdpService` orchestrator are untouched, and stay free of any dependency on
`prom-client`.

**`/metrics` is open**, matching the MiniLedger floor and standard scrape-target practice. It is
`SkipThrottle`d (a scraper polls it every few seconds) and excluded from request logging
(pino `autoLogging.ignore`). It exposes no tenant data — only aggregate counters and process
gauges. In production the endpoint is reached over the internal network by the Prometheus scraper;
network policy, not app auth, is the right boundary for a scrape target.

## Consequences

- Operators get RED-style signals (rate/errors/duration) per route and, more importantly, a
  live permit/deny rate and PDP latency distribution suitable for SLOs and alerting.
- The metrics library stays at the edge: only `observability` and one `authz.module` factory
  line know about `prom-client`. The decorator is unit-tested in isolation and adds no latency to
  the decision (a counter increment + histogram observe are in-memory).
- **Distributed tracing (OpenTelemetry) is a deferred ring.** With a single service there is no
  cross-service span to correlate; the correlation ID already threads one request through the
  logs. Tracing becomes valuable once the outbox relay and **EventBridge** land — a request that
  fans out across services. Adopting OTel then (spans exported to a collector) is additive and
  does not invalidate this metrics floor.
- `/metrics` being open is an accepted, documented trade-off; if a future deployment needs it
  closed, the same `PapAdminGuard`/network-policy patterns already in the codebase apply.
