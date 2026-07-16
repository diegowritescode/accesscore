import { OrgId } from '../../../shared/kernel/org-id';
import { Revision } from '../../../shared/kernel/revision';
import { type Decision } from '../decision';
import { type Condition } from './condition';
import { decide } from './decide';
import { type EvaluationContext } from './evaluation-context';
import { type Policy } from './policy';

const orgId = OrgId.generate();
const ctx: EvaluationContext = {
  principal: { aal: 2, authTime: null },
  env: { ip: '10.0.0.1', now: new Date('2026-07-16T12:00:00.000Z') },
  resource: {},
};

const trueCondition: Condition = {
  kind: 'cmp',
  op: 'ge',
  left: { kind: 'attr', path: 'principal.aal' },
  right: { kind: 'lit', value: 0 },
};
const falseCondition: Condition = {
  kind: 'cmp',
  op: 'lt',
  left: { kind: 'attr', path: 'principal.aal' },
  right: { kind: 'lit', value: 0 },
};
const indeterminateCondition: Condition = {
  kind: 'cmp',
  op: 'eq',
  left: { kind: 'attr', path: 'principal.aal' },
  right: { kind: 'lit', value: true },
};

const policy = (over: Partial<Policy>): Policy => ({
  id: 'p1',
  orgId,
  effect: 'forbid',
  resourceType: 'document',
  action: 'read',
  condition: trueCondition,
  revision: Revision.fromValue(0),
  ...over,
});

const permit: Decision = { effect: 'permit', reasons: [{ code: 'grant.direct', message: 'x' }] };
const denied: Decision = { effect: 'deny', reasons: [{ code: 'default_deny', message: 'x' }] };

describe('decide', () => {
  it('is the identity when no policy applies', () => {
    expect(decide(permit, [], ctx)).toBe(permit);
    expect(decide(denied, [], ctx)).toBe(denied);
  });

  it('lets a matching forbid override a relationship permit', () => {
    const result = decide(permit, [policy({ effect: 'forbid', condition: trueCondition })], ctx);
    expect(result.effect).toBe('deny');
    expect(result.reasons[0]?.code).toBe('forbid_matched');
  });

  it('makes forbid win over permit regardless of order', () => {
    const forbid = policy({ id: 'f', effect: 'forbid', condition: trueCondition });
    const allow = policy({ id: 'a', effect: 'permit', condition: trueCondition });
    expect(decide(denied, [forbid, allow], ctx).effect).toBe('deny');
    expect(decide(denied, [allow, forbid], ctx).effect).toBe('deny');
  });

  it('is fail-closed: a forbid whose condition is indeterminate still denies', () => {
    const result = decide(
      permit,
      [policy({ effect: 'forbid', condition: indeterminateCondition })],
      ctx,
    );
    expect(result.effect).toBe('deny');
    expect(result.reasons[0]?.code).toBe('forbid_matched');
  });

  it('is fail-closed: a permit whose condition is indeterminate is inert', () => {
    const result = decide(
      denied,
      [policy({ effect: 'permit', condition: indeterminateCondition })],
      ctx,
    );
    expect(result).toBe(denied);
  });

  it('does not let a forbid with a false condition match', () => {
    const result = decide(permit, [policy({ effect: 'forbid', condition: falseCondition })], ctx);
    expect(result).toBe(permit);
  });

  it('lets a matching permit grant when relationships denied', () => {
    const result = decide(denied, [policy({ effect: 'permit', condition: trueCondition })], ctx);
    expect(result.effect).toBe('permit');
    expect(result.reasons[0]?.code).toBe('grant.policy');
  });
});
