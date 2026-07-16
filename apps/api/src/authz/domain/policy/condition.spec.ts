import { type Condition, parseCondition } from './condition';

describe('parseCondition', () => {
  it('accepts a well-typed condition over the fixed attribute set', () => {
    const condition: Condition = {
      kind: 'and',
      children: [
        {
          kind: 'cmp',
          op: 'ge',
          left: { kind: 'attr', path: 'principal.aal' },
          right: { kind: 'lit', value: 2 },
        },
        {
          kind: 'ipInCidr',
          ip: { kind: 'attr', path: 'env.ip' },
          cidrs: ['10.0.0.0/8', '::1/128'],
        },
        { kind: 'in', needle: { kind: 'attr', path: 'principal.aal' }, set: [1, 2, 3] },
        {
          kind: 'not',
          child: {
            kind: 'cmp',
            op: 'lt',
            left: { kind: 'attr', path: 'env.now' },
            right: { kind: 'lit', value: '2026-01-01T00:00:00.000Z' },
          },
        },
      ],
    };
    expect(parseCondition(condition).ok).toBe(true);
  });

  it.each<[string, Condition, string]>([
    [
      'comparing aal to a string',
      {
        kind: 'cmp',
        op: 'eq',
        left: { kind: 'attr', path: 'principal.aal' },
        right: { kind: 'lit', value: 'two' },
      },
      'type_mismatch',
    ],
    [
      'ordering a non-ordinal string',
      {
        kind: 'cmp',
        op: 'lt',
        left: { kind: 'attr', path: 'env.ip' },
        right: { kind: 'lit', value: 'x' },
      },
      'type_mismatch',
    ],
    ['an empty and', { kind: 'and', children: [] }, 'empty_children'],
    [
      'an empty in-set',
      { kind: 'in', needle: { kind: 'attr', path: 'principal.aal' }, set: [] },
      'empty_set',
    ],
    [
      'a mixed-type in-set',
      { kind: 'in', needle: { kind: 'attr', path: 'env.ip' }, set: ['a', 1] },
      'mixed_set_types',
    ],
    [
      'ipInCidr on a number attribute',
      { kind: 'ipInCidr', ip: { kind: 'attr', path: 'principal.aal' }, cidrs: ['10.0.0.0/8'] },
      'type_mismatch',
    ],
    [
      'empty cidrs',
      { kind: 'ipInCidr', ip: { kind: 'attr', path: 'env.ip' }, cidrs: [] },
      'empty_cidrs',
    ],
    [
      'an out-of-range cidr octet',
      { kind: 'ipInCidr', ip: { kind: 'attr', path: 'env.ip' }, cidrs: ['999.0.0.0/8'] },
      'invalid_cidr',
    ],
    [
      'an unparseable timestamp literal',
      {
        kind: 'cmp',
        op: 'lt',
        left: { kind: 'attr', path: 'env.now' },
        right: { kind: 'lit', value: 'not-a-date' },
      },
      'invalid_timestamp',
    ],
  ])('rejects %s', (_label, condition, expected) => {
    const result = parseCondition(condition);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(expected);
  });

  it('rejects a condition nested beyond the depth cap', () => {
    let condition: Condition = {
      kind: 'cmp',
      op: 'eq',
      left: { kind: 'attr', path: 'principal.aal' },
      right: { kind: 'lit', value: 1 },
    };
    for (let i = 0; i < 20; i += 1) {
      condition = { kind: 'not', child: condition };
    }
    const result = parseCondition(condition);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('condition_too_deep');
  });

  it('rejects a condition exceeding the node cap', () => {
    const children: Condition[] = [];
    for (let i = 0; i < 70; i += 1) {
      children.push({
        kind: 'cmp',
        op: 'eq',
        left: { kind: 'attr', path: 'principal.aal' },
        right: { kind: 'lit', value: 1 },
      });
    }
    const result = parseCondition({ kind: 'and', children });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('too_many_condition_nodes');
  });
});
