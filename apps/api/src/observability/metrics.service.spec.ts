import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('renders default process metrics under the accesscore service label', async () => {
    const metrics = new MetricsService();
    const text = await metrics.render();
    expect(text).toContain('nodejs_');
    expect(text).toContain('service="accesscore"');
  });

  it('exposes the http duration histogram once observed', async () => {
    const metrics = new MetricsService();
    metrics.observeHttp('GET', 'AuthzController.check', 200, 0.012);
    const text = await metrics.render();
    expect(text).toContain('http_request_duration_seconds_bucket');
    expect(text).toContain('route="AuthzController.check"');
    expect(text).toContain('status_code="200"');
  });

  it('counts authorization decisions and their latency by effect', async () => {
    const metrics = new MetricsService();
    metrics.observeDecision('permit', 0.004);
    metrics.observeDecision('deny', 0.006);
    metrics.observeDecision('permit', 0.002);
    const text = await metrics.render();
    expect(text).toMatch(/authz_decisions_total\{[^}]*effect="permit"[^}]*\} 2/);
    expect(text).toMatch(/authz_decisions_total\{[^}]*effect="deny"[^}]*\} 1/);
    expect(text).toContain('authz_decision_duration_seconds_bucket');
  });

  it('exposes the decision-log buffer depth, outcomes and flush lag', async () => {
    const metrics = new MetricsService();
    metrics.setDecisionLogBufferDepth(42);
    metrics.observeDecisionLogRecords('flushed', 500);
    metrics.observeDecisionLogRecords('degraded', 1);
    metrics.observeDecisionLogRecords('dropped', 3);
    metrics.observeDecisionLogFlushLag(0.75);
    const text = await metrics.render();
    expect(text).toMatch(/authz_decision_log_buffer_depth\{[^}]*\} 42/);
    expect(text).toMatch(/authz_decision_log_records_total\{[^}]*outcome="flushed"[^}]*\} 500/);
    expect(text).toMatch(/authz_decision_log_records_total\{[^}]*outcome="degraded"[^}]*\} 1/);
    expect(text).toMatch(/authz_decision_log_records_total\{[^}]*outcome="dropped"[^}]*\} 3/);
    expect(text).toMatch(/authz_decision_log_flush_lag_seconds_sum\{[^}]*\} 0\.75/);
  });
});
