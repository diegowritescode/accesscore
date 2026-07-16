import { type AuthTokenClaims } from '../../authn/interface/access-token.guard';
import { ProblemException } from '../../shared/http/problem-details';
import { type Clock } from '../../shared/kernel/clock';
import { type Principal } from '../domain/authorization-request';
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

  it('check-as evaluates for the requested subject, read-only, and returns the decision', async () => {
    const permitted: Decision = {
      effect: 'permit',
      reasons: [{ code: 'grant.nested_group', message: 'x' }],
    };
    const recorded: { principal?: Principal; overlay?: unknown } = {};
    const pdp: PolicyDecisionPoint = {
      check: () => Promise.reject(new Error('unused')),
      batchCheck: () => Promise.reject(new Error('unused')),
      expand: () => Promise.reject(new Error('unused')),
      simulate: (principal, _action, _resource, _context, overlay) => {
        recorded.principal = principal;
        recorded.overlay = overlay;
        return Promise.resolve({ decision: permitted, live: permitted, changed: false });
      },
    };
    const controller = new AuthzController(pdp, clock);

    const response = await controller.checkAs(
      token,
      {
        subject: { type: 'user', id: 'bob' },
        action: 'document.read',
        resource: { type: 'document', id: 'doc-1' },
        aal: 2,
      },
      '127.0.0.1',
    );

    expect(response.effect).toBe('permit');
    expect(recorded.overlay).toBeNull();
    expect(recorded.principal?.subject).toEqual({ type: 'user', id: 'bob' });
    expect(recorded.principal?.orgId).toBe('org-1');
    expect(recorded.principal?.assuranceLevel).toBe(2);
  });

  it('check-as defaults the assurance level to 1 when omitted', async () => {
    const recorded: { principal?: Principal } = {};
    const pdp: PolicyDecisionPoint = {
      check: () => Promise.reject(new Error('unused')),
      batchCheck: () => Promise.reject(new Error('unused')),
      expand: () => Promise.reject(new Error('unused')),
      simulate: (principal) => {
        recorded.principal = principal;
        return Promise.resolve({
          decision: { effect: 'deny', reasons: [] },
          live: { effect: 'deny', reasons: [] },
          changed: false,
        });
      },
    };
    const controller = new AuthzController(pdp, clock);

    await controller.checkAs(
      token,
      {
        subject: { type: 'user', id: 'carol' },
        action: 'document.read',
        resource: { type: 'document', id: 'doc-1' },
      },
      '127.0.0.1',
    );

    expect(recorded.principal?.assuranceLevel).toBe(1);
  });

  it('check-as rejects an invalid body with a 400 problem', async () => {
    const controller = new AuthzController(pdpReturning({ effect: 'permit', reasons: [] }), clock);
    await expect(
      controller.checkAs(token, { action: 'document.read' }, '127.0.0.1'),
    ).rejects.toBeInstanceOf(ProblemException);
  });

  it('check-as rejects a caller with no organization as a 400 problem', async () => {
    const controller = new AuthzController(pdpReturning({ effect: 'permit', reasons: [] }), clock);
    await expect(
      controller.checkAs(
        { ...token, org: null },
        {
          subject: { type: 'user', id: 'bob' },
          action: 'document.read',
          resource: { type: 'document', id: 'doc-1' },
        },
        '127.0.0.1',
      ),
    ).rejects.toBeInstanceOf(ProblemException);
  });

  it('check-as fails closed with a 503 problem when the PDP errors', async () => {
    const failingPdp: PolicyDecisionPoint = {
      check: () => Promise.reject(new Error('unused')),
      batchCheck: () => Promise.reject(new Error('unused')),
      expand: () => Promise.reject(new Error('unused')),
      simulate: () => Promise.reject(new Error('store unavailable')),
    };
    const controller = new AuthzController(failingPdp, clock);

    await expect(
      controller.checkAs(
        token,
        {
          subject: { type: 'user', id: 'bob' },
          action: 'document.read',
          resource: { type: 'document', id: 'doc-1' },
        },
        '127.0.0.1',
      ),
    ).rejects.toBeInstanceOf(ProblemException);
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
