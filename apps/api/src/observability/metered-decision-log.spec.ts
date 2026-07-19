import { OrgId } from '../shared/kernel/org-id';
import { Revision } from '../shared/kernel/revision';
import { type DecisionLog, type DecisionLogRecord } from '../authz/domain/ports/decision-log';
import { MeteredDecisionLog } from './metered-decision-log';
import { MetricsService } from './metrics.service';

const record = (overrides: Partial<DecisionLogRecord> = {}): DecisionLogRecord => ({
  id: 'd1',
  orgId: OrgId.fromString('11111111-1111-1111-1111-111111111111'),
  subject: 'user:alice',
  action: 'document.read',
  resource: 'document:onboarding',
  effect: 'permit',
  reasons: [],
  revisionUsed: Revision.fromValue(7),
  latencyMs: 12,
  createdAt: new Date('2026-07-19T00:00:00.000Z'),
  ...overrides,
});

describe('MeteredDecisionLog', () => {
  it('records the decision metric in seconds and delegates to the inner log', async () => {
    const written: DecisionLogRecord[] = [];
    const inner: DecisionLog = { record: (entry) => (written.push(entry), Promise.resolve()) };
    const metrics = new MetricsService();
    const observe = jest.spyOn(metrics, 'observeDecision');

    const log = new MeteredDecisionLog(inner, metrics);
    await log.record(record({ effect: 'deny', latencyMs: 25 }));

    expect(observe).toHaveBeenCalledWith('deny', 0.025);
    expect(written).toHaveLength(1);
    expect(written[0]?.effect).toBe('deny');
  });

  it('propagates a failing inner log', async () => {
    const inner: DecisionLog = { record: () => Promise.reject(new Error('store down')) };
    const log = new MeteredDecisionLog(inner, new MetricsService());
    await expect(log.record(record())).rejects.toThrow('store down');
  });
});
