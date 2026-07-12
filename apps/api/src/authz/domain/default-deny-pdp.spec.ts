import {
  type Action,
  type Principal,
  type RequestContext,
  type Resource,
} from './authorization-request';
import { DefaultDenyPolicyDecisionPoint } from './default-deny-pdp';

describe('DefaultDenyPolicyDecisionPoint', () => {
  const pdp = new DefaultDenyPolicyDecisionPoint();

  const principal: Principal = {
    subject: { type: 'user', id: 'user-1' },
    orgId: 'org-1',
    assuranceLevel: 1,
    sessionId: 'session-1',
    authenticatedAt: new Date('2026-07-12T00:00:00.000Z'),
  };
  const action: Action = { name: 'document.read' };
  const resource: Resource = { type: 'document', id: 'document-1' };
  const context: RequestContext = {
    ip: '203.0.113.7',
    requestId: 'request-1',
    requestedAt: new Date('2026-07-12T00:00:00.000Z'),
    consistency: { mode: 'full' },
  };

  it('denies by default as the identity element of the deny-override model', async () => {
    const decision = await pdp.check(principal, action, resource, context);

    expect(decision.effect).toBe('deny');
    expect(decision.reasons).toEqual([{ code: 'default_deny', message: expect.any(String) }]);
  });
});
