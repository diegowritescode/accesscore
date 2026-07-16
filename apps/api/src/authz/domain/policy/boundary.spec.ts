import { type Decision } from '../decision';
import { type EntityRef } from '../entity-ref';
import { applyBounds, type BoundaryTarget, type Bounds, UNBOUNDED } from './boundary';

const alice: EntityRef = { type: 'user', id: 'alice' };
const target: BoundaryTarget = { resourceType: 'document', action: 'read' };
const permit: Decision = { effect: 'permit', reasons: [{ code: 'grant.direct', message: 'x' }] };
const denied: Decision = { effect: 'deny', reasons: [{ code: 'default_deny', message: 'x' }] };

describe('applyBounds', () => {
  it('is inert when there is no boundary or guardrail', () => {
    expect(applyBounds(permit, target, alice, UNBOUNDED)).toBe(permit);
  });

  it('never turns a deny into a permit', () => {
    const bounds: Bounds = { boundaries: [], guardrail: { allow: [] } };
    expect(applyBounds(denied, target, alice, bounds)).toBe(denied);
  });

  it('denies a permit outside the org guardrail', () => {
    const bounds: Bounds = {
      boundaries: [],
      guardrail: { allow: [{ resourceType: 'folder', action: 'read' }] },
    };
    const result = applyBounds(permit, target, alice, bounds);
    expect(result.effect).toBe('deny');
    expect(result.reasons[0]?.code).toBe('outside_org_guardrail');
  });

  it('keeps a permit within the org guardrail (wildcard action)', () => {
    const bounds: Bounds = {
      boundaries: [],
      guardrail: { allow: [{ resourceType: 'document', action: '*' }] },
    };
    expect(applyBounds(permit, target, alice, bounds)).toBe(permit);
  });

  it('denies a permit outside a bounded principal boundary', () => {
    const bounds: Bounds = {
      boundaries: [{ subject: alice, allow: [{ resourceType: 'document', action: 'write' }] }],
      guardrail: null,
    };
    const result = applyBounds(permit, target, alice, bounds);
    expect(result.effect).toBe('deny');
    expect(result.reasons[0]?.code).toBe('outside_permission_boundary');
  });

  it('denies a bounded principal with an empty ceiling (absence = deny)', () => {
    const bounds: Bounds = { boundaries: [{ subject: alice, allow: [] }], guardrail: null };
    expect(applyBounds(permit, target, alice, bounds).effect).toBe('deny');
  });

  it('leaves an unbounded principal unaffected', () => {
    const bob: EntityRef = { type: 'user', id: 'bob' };
    const bounds: Bounds = { boundaries: [{ subject: bob, allow: [] }], guardrail: null };
    expect(applyBounds(permit, target, alice, bounds)).toBe(permit);
  });

  it('keeps a permit within a bounded principal boundary', () => {
    const bounds: Bounds = {
      boundaries: [{ subject: alice, allow: [{ resourceType: 'document', action: 'read' }] }],
      guardrail: null,
    };
    expect(applyBounds(permit, target, alice, bounds)).toBe(permit);
  });
});
