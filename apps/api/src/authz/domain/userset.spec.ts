import { computedUsersetTargets, directUserset, type Userset } from './userset';

describe('directUserset', () => {
  it('is the "this" userset', () => {
    expect(directUserset).toEqual({ kind: 'this' });
  });
});

describe('computedUsersetTargets', () => {
  it('returns no targets for "this"', () => {
    expect(computedUsersetTargets({ kind: 'this' })).toEqual([]);
  });

  it('returns no targets for tupleToUserset (its targets are resolved by traversal, not by name)', () => {
    expect(
      computedUsersetTargets({
        kind: 'tupleToUserset',
        tupleset: 'parent',
        computedUserset: 'viewer',
      }),
    ).toEqual([]);
  });

  it('returns the single relation for computedUserset', () => {
    expect(computedUsersetTargets({ kind: 'computedUserset', relation: 'editor' })).toEqual([
      'editor',
    ]);
  });

  it('flattens the children of a union', () => {
    const userset: Userset = {
      kind: 'union',
      children: [
        { kind: 'computedUserset', relation: 'owner' },
        { kind: 'computedUserset', relation: 'editor' },
      ],
    };
    expect(computedUsersetTargets(userset)).toEqual(['owner', 'editor']);
  });

  it('flattens the children of an intersection', () => {
    const userset: Userset = {
      kind: 'intersection',
      children: [
        { kind: 'computedUserset', relation: 'member' },
        { kind: 'computedUserset', relation: 'billing' },
      ],
    };
    expect(computedUsersetTargets(userset)).toEqual(['member', 'billing']);
  });

  it('collects targets from both sides of an exclusion', () => {
    const userset: Userset = {
      kind: 'exclusion',
      base: { kind: 'computedUserset', relation: 'editor' },
      subtract: { kind: 'computedUserset', relation: 'banned' },
    };
    expect(computedUsersetTargets(userset)).toEqual(['editor', 'banned']);
  });

  it('preserves the base-then-subtract order in an exclusion (not just the union of names)', () => {
    const userset: Userset = {
      kind: 'exclusion',
      base: { kind: 'computedUserset', relation: 'a' },
      subtract: { kind: 'computedUserset', relation: 'b' },
    };
    const targets = computedUsersetTargets(userset);
    expect(targets).toEqual(['a', 'b']);
    expect(targets).not.toEqual(['b', 'a']);
  });

  it('recurses through nested combinators', () => {
    const userset: Userset = {
      kind: 'union',
      children: [
        { kind: 'computedUserset', relation: 'owner' },
        {
          kind: 'exclusion',
          base: { kind: 'computedUserset', relation: 'editor' },
          subtract: {
            kind: 'intersection',
            children: [{ kind: 'computedUserset', relation: 'banned' }, { kind: 'this' }],
          },
        },
      ],
    };
    expect(computedUsersetTargets(userset)).toEqual(['owner', 'editor', 'banned']);
  });

  it('returns no targets for a union with no children', () => {
    expect(computedUsersetTargets({ kind: 'union', children: [] })).toEqual([]);
  });
});
