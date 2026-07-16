import { type AuthTokenClaims } from '../../authn/interface/access-token.guard';
import { ProblemException } from '../../shared/http/problem-details';
import { type Clock } from '../../shared/kernel/clock';
import { type Decision } from '../domain/decision';
import { type PolicyDecisionPoint } from '../domain/policy-decision-point';
import { AuthzController } from './authz.controller';

const clock: Clock = { now: () => new Date(0) };
const token: AuthTokenClaims = {
  sub: 'user-1',
  sid: 'sid-1',
  org: 'org-1',
  jti: 'jti-1',
  aal: 1,
  exp: 0,
};
const body = { action: 'document.read', resource: { type: 'document', id: 'doc-1' } };

const pdpReturning = (decision: Decision): PolicyDecisionPoint => ({
  check: () => Promise.resolve(decision),
  batchCheck: (requests) => Promise.resolve(requests.map(() => decision)),
  expand: () => Promise.resolve([]),
  simulate: () => Promise.resolve({ decision, live: decision, changed: false }),
});

describe('AuthzController', () => {
  it('returns the PDP decision with only reason codes and messages', async () => {
    const controller = new AuthzController(
      pdpReturning({ effect: 'deny', reasons: [{ code: 'default_deny', message: 'no grant' }] }),
      clock,
    );

    const response = await controller.check(token, body, '127.0.0.1');

    expect(response.effect).toBe('deny');
    expect(response.reasons).toEqual([{ code: 'default_deny', message: 'no grant' }]);
  });

  it('simulate builds the overlay, returns proposed vs live, and reports the diff', async () => {
    const permitted: Decision = {
      effect: 'permit',
      reasons: [{ code: 'grant.direct', message: 'x' }],
    };
    const denied: Decision = {
      effect: 'deny',
      reasons: [{ code: 'forbid_matched', message: 'y' }],
    };
    let received: readonly unknown[] | null = null;
    const pdp: PolicyDecisionPoint = {
      check: () => Promise.reject(new Error('unused')),
      batchCheck: () => Promise.reject(new Error('unused')),
      expand: () => Promise.reject(new Error('unused')),
      simulate: (_principal, _action, _resource, _context, overlay) => {
        received = overlay;
        return Promise.resolve({ decision: denied, live: permitted, changed: true });
      },
    };
    const controller = new AuthzController(pdp, clock);

    const response = await controller.simulate(
      token,
      {
        action: 'document.read',
        resource: { type: 'document', id: 'doc-1' },
        policies: [
          {
            effect: 'forbid',
            resourceType: 'document',
            action: 'read',
            condition: {
              kind: 'cmp',
              op: 'lt',
              left: { kind: 'attr', path: 'principal.aal' },
              right: { kind: 'lit', value: 2 },
            },
          },
        ],
      },
      '127.0.0.1',
    );

    expect(response.decision.effect).toBe('deny');
    expect(response.live.effect).toBe('permit');
    expect(response.changed).toBe(true);
    expect(received).toHaveLength(1);
  });

  it('simulate rejects an invalid body with a 400 problem', async () => {
    const controller = new AuthzController(pdpReturning({ effect: 'permit', reasons: [] }), clock);
    await expect(controller.simulate(token, { action: '' }, '127.0.0.1')).rejects.toBeInstanceOf(
      ProblemException,
    );
  });

  it('fails closed with a 503 problem when the PDP errors', async () => {
    const failingPdp: PolicyDecisionPoint = {
      check: () => Promise.reject(new Error('store unavailable')),
      batchCheck: () => Promise.reject(new Error('store unavailable')),
      expand: () => Promise.reject(new Error('store unavailable')),
      simulate: () => Promise.reject(new Error('store unavailable')),
    };
    const controller = new AuthzController(failingPdp, clock);

    await expect(controller.check(token, body, '127.0.0.1')).rejects.toBeInstanceOf(
      ProblemException,
    );
  });

  it('maps each decision in a batch to a result', async () => {
    const controller = new AuthzController(
      pdpReturning({ effect: 'permit', reasons: [{ code: 'grant.direct', message: 'ok' }] }),
      clock,
    );

    const response = await controller.batchCheck(token, { checks: [body, body] }, '127.0.0.1');

    expect(response.results).toHaveLength(2);
    expect(response.results[0]).toEqual({
      effect: 'permit',
      reasons: [{ code: 'grant.direct', message: 'ok' }],
    });
  });

  it('rejects a batch with no checks as a 400 problem', async () => {
    const controller = new AuthzController(pdpReturning({ effect: 'deny', reasons: [] }), clock);

    await expect(controller.batchCheck(token, { checks: [] }, '127.0.0.1')).rejects.toBeInstanceOf(
      ProblemException,
    );
  });

  it('rejects a batch item with a malformed action as a 400 problem', async () => {
    const controller = new AuthzController(pdpReturning({ effect: 'deny', reasons: [] }), clock);
    const malformed = { checks: [{ action: 'not-an-action', resource: body.resource }] };

    await expect(controller.batchCheck(token, malformed, '127.0.0.1')).rejects.toBeInstanceOf(
      ProblemException,
    );
  });

  it('fails a batch closed with a 503 problem when the PDP errors', async () => {
    const failingPdp: PolicyDecisionPoint = {
      check: () => Promise.reject(new Error('store unavailable')),
      batchCheck: () => Promise.reject(new Error('store unavailable')),
      expand: () => Promise.reject(new Error('store unavailable')),
      simulate: () => Promise.reject(new Error('store unavailable')),
    };
    const controller = new AuthzController(failingPdp, clock);

    await expect(
      controller.batchCheck(token, { checks: [body] }, '127.0.0.1'),
    ).rejects.toBeInstanceOf(ProblemException);
  });

  it('returns the subjects the PDP expands for a relation', async () => {
    const expanding: PolicyDecisionPoint = {
      check: () => Promise.reject(new Error('unused')),
      batchCheck: () => Promise.reject(new Error('unused')),
      expand: () => Promise.resolve([{ type: 'user', id: 'alice' }]),
      simulate: () => Promise.reject(new Error('unused')),
    };
    const controller = new AuthzController(expanding, clock);

    const response = await controller.expand(token, {
      resource: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
    });

    expect(response.subjects).toEqual([{ type: 'user', id: 'alice' }]);
  });

  it('rejects a malformed expand body as a 400 problem', async () => {
    const controller = new AuthzController(pdpReturning({ effect: 'deny', reasons: [] }), clock);

    await expect(
      controller.expand(token, { resource: { type: 'document' } }),
    ).rejects.toBeInstanceOf(ProblemException);
  });

  it('fails expand closed with a 503 problem when the PDP errors', async () => {
    const failingPdp: PolicyDecisionPoint = {
      check: () => Promise.reject(new Error('store unavailable')),
      batchCheck: () => Promise.reject(new Error('store unavailable')),
      expand: () => Promise.reject(new Error('store unavailable')),
      simulate: () => Promise.reject(new Error('store unavailable')),
    };
    const controller = new AuthzController(failingPdp, clock);

    await expect(
      controller.expand(token, { resource: { type: 'document', id: 'doc-1' }, relation: 'viewer' }),
    ).rejects.toBeInstanceOf(ProblemException);
  });
});
