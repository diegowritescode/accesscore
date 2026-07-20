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
});
