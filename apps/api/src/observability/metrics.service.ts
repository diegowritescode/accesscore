import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

export type DecisionLogOutcome = 'flushed' | 'degraded' | 'dropped';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  private readonly httpDuration: Histogram<'method' | 'route' | 'status_code'>;
  private readonly authzDecisions: Counter<'effect'>;
  private readonly authzDecisionDuration: Histogram<'effect'>;
  private readonly decisionLogBufferDepth: Gauge<string>;
  private readonly decisionLogRecords: Counter<'outcome'>;
  private readonly decisionLogFlushLag: Histogram<string>;

  constructor() {
    this.registry.setDefaultLabels({ service: 'accesscore' });
    collectDefaultMetrics({ register: this.registry });
    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds, by handler and status.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
    this.authzDecisions = new Counter({
      name: 'authz_decisions_total',
      help: 'Authorization decisions evaluated by the PDP, by effect.',
      labelNames: ['effect'],
      registers: [this.registry],
    });
    this.authzDecisionDuration = new Histogram({
      name: 'authz_decision_duration_seconds',
      help: 'PDP evaluation latency in seconds, by effect.',
      labelNames: ['effect'],
      buckets: [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
      registers: [this.registry],
    });
    this.decisionLogBufferDepth = new Gauge({
      name: 'authz_decision_log_buffer_depth',
      help: 'Decision-log entries held in memory awaiting a batched flush.',
      registers: [this.registry],
    });
    this.decisionLogRecords = new Counter({
      name: 'authz_decision_log_records_total',
      help: 'Decision-log entries by write outcome: flushed in a batch, written synchronously under backpressure, or lost to a failed flush.',
      labelNames: ['outcome'],
      registers: [this.registry],
    });
    this.decisionLogFlushLag = new Histogram({
      name: 'authz_decision_log_flush_lag_seconds',
      help: 'Age of the oldest entry in a decision-log flush batch, in seconds.',
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers: [this.registry],
    });
  }

  observeHttp(method: string, route: string, statusCode: number, seconds: number): void {
    this.httpDuration.observe({ method, route, status_code: statusCode }, seconds);
  }

  observeDecision(effect: string, seconds: number): void {
    this.authzDecisions.inc({ effect });
    this.authzDecisionDuration.observe({ effect }, seconds);
  }

  setDecisionLogBufferDepth(depth: number): void {
    this.decisionLogBufferDepth.set(depth);
  }

  observeDecisionLogRecords(outcome: DecisionLogOutcome, count: number): void {
    this.decisionLogRecords.inc({ outcome }, count);
  }

  observeDecisionLogFlushLag(seconds: number): void {
    this.decisionLogFlushLag.observe(seconds);
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
