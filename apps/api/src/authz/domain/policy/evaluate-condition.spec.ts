import fc from 'fast-check';
import { type Condition, type Term } from './condition';
import { evalCondition, type Verdict } from './evaluate-condition';
import { type EvaluationContext } from './evaluation-context';

const ctx = (over: Partial<{ aal: number; ip: string; now: Date }> = {}): EvaluationContext => ({
  principal: { aal: over.aal ?? 2, authTime: null },
  env: { ip: over.ip ?? '10.1.2.3', now: over.now ?? new Date('2026-07-16T12:00:00.000Z') },
  resource: {},
});

const aalGe = (value: number): Condition => ({
  kind: 'cmp',
  op: 'ge',
  left: { kind: 'attr', path: 'principal.aal' },
  right: { kind: 'lit', value },
});

describe('evalCondition', () => {
  it('evaluates numeric comparisons on the assurance level', () => {
    expect(evalCondition(aalGe(2), ctx({ aal: 2 }))).toBe(true);
    expect(evalCondition(aalGe(2), ctx({ aal: 1 }))).toBe(false);
  });

  it('evaluates temporal comparisons against an ISO literal', () => {
    const before: Condition = {
      kind: 'cmp',
      op: 'lt',
      left: { kind: 'attr', path: 'env.now' },
      right: { kind: 'lit', value: '2026-07-16T18:00:00.000Z' },
    };
    expect(evalCondition(before, ctx())).toBe(true);
    expect(evalCondition(before, ctx({ now: new Date('2026-07-16T20:00:00.000Z') }))).toBe(false);
  });

  it('evaluates string equality and set membership', () => {
    const eqIp: Condition = {
      kind: 'cmp',
      op: 'eq',
      left: { kind: 'attr', path: 'env.ip' },
      right: { kind: 'lit', value: '10.1.2.3' },
    };
    expect(evalCondition(eqIp, ctx())).toBe(true);
    const inSet: Condition = {
      kind: 'in',
      needle: { kind: 'attr', path: 'principal.aal' },
      set: [2, 3],
    };
    expect(evalCondition(inSet, ctx({ aal: 2 }))).toBe(true);
    expect(evalCondition(inSet, ctx({ aal: 1 }))).toBe(false);
  });

  it('matches IPv4 and IPv6 CIDRs, and is indeterminate for an unparseable address', () => {
    const inCidr: Condition = {
      kind: 'ipInCidr',
      ip: { kind: 'attr', path: 'env.ip' },
      cidrs: ['10.0.0.0/8', 'fd00::/8'],
    };
    expect(evalCondition(inCidr, ctx({ ip: '10.9.9.9' }))).toBe(true);
    expect(evalCondition(inCidr, ctx({ ip: '192.168.0.1' }))).toBe(false);
    expect(evalCondition(inCidr, ctx({ ip: 'fd00::1' }))).toBe(true);
    expect(evalCondition(inCidr, ctx({ ip: '2001:db8::1' }))).toBe(false);
    expect(evalCondition(inCidr, ctx({ ip: 'not-an-ip' }))).toBe('indeterminate');
  });

  it('applies Kleene three-valued logic across and / or / not', () => {
    const mismatch: Condition = {
      kind: 'cmp',
      op: 'eq',
      left: { kind: 'attr', path: 'principal.aal' },
      right: { kind: 'lit', value: true },
    };
    expect(evalCondition(mismatch, ctx())).toBe('indeterminate');
    expect(evalCondition({ kind: 'and', children: [aalGe(2), mismatch] }, ctx())).toBe(
      'indeterminate',
    );
    expect(evalCondition({ kind: 'and', children: [aalGe(9), mismatch] }, ctx())).toBe(false);
    expect(evalCondition({ kind: 'or', children: [aalGe(2), mismatch] }, ctx())).toBe(true);
    expect(evalCondition({ kind: 'or', children: [aalGe(9), mismatch] }, ctx())).toBe(
      'indeterminate',
    );
    expect(evalCondition({ kind: 'not', child: mismatch }, ctx())).toBe('indeterminate');
    expect(evalCondition({ kind: 'not', child: aalGe(9) }, ctx())).toBe(true);
  });

  it('is indeterminate for an ordered comparison on non-ordinal operands', () => {
    const orderedString: Condition = {
      kind: 'cmp',
      op: 'lt',
      left: { kind: 'attr', path: 'env.ip' },
      right: { kind: 'lit', value: 'x' },
    };
    expect(evalCondition(orderedString, ctx())).toBe('indeterminate');
  });

  it('is total: never throws and always returns a Verdict over arbitrary conditions', () => {
    const term: fc.Arbitrary<Term> = fc.oneof(
      fc.constantFrom<Term>(
        { kind: 'attr', path: 'principal.aal' },
        { kind: 'attr', path: 'env.ip' },
        { kind: 'attr', path: 'env.now' },
      ),
      fc
        .oneof(fc.boolean(), fc.integer(), fc.string())
        .map((value): Term => ({ kind: 'lit', value })),
    );
    const leaf: fc.Arbitrary<Condition> = fc.oneof(
      fc.record({
        kind: fc.constant('cmp' as const),
        op: fc.constantFrom('eq', 'ne', 'lt', 'le', 'gt', 'ge'),
        left: term,
        right: term,
      }),
      fc.record({
        kind: fc.constant('in' as const),
        needle: term,
        set: fc.array(fc.oneof(fc.string(), fc.integer()), { minLength: 1, maxLength: 4 }),
      }),
      fc.record({
        kind: fc.constant('ipInCidr' as const),
        ip: term,
        cidrs: fc.array(fc.string(), { minLength: 1, maxLength: 3 }),
      }),
    );
    const condition: fc.Arbitrary<Condition> = fc.oneof(
      leaf,
      fc.record({
        kind: fc.constantFrom('and' as const, 'or' as const),
        children: fc.array(leaf, { minLength: 1, maxLength: 3 }),
      }),
      fc.record({ kind: fc.constant('not' as const), child: leaf }),
    );

    fc.assert(
      fc.property(
        condition,
        fc.record({ aal: fc.integer(), ip: fc.string(), now: fc.date({ noInvalidDate: true }) }),
        (candidate, over) => {
          const verdict: Verdict = evalCondition(candidate, ctx(over));
          expect(verdict === true || verdict === false || verdict === 'indeterminate').toBe(true);
        },
      ),
    );
  });
});
