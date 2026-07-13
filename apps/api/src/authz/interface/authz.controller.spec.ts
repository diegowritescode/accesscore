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

  it('fails closed with a 503 problem when the PDP errors', async () => {
    const failingPdp: PolicyDecisionPoint = {
      check: () => Promise.reject(new Error('store unavailable')),
    };
    const controller = new AuthzController(failingPdp, clock);

    await expect(controller.check(token, body, '127.0.0.1')).rejects.toBeInstanceOf(
      ProblemException,
    );
  });
});
