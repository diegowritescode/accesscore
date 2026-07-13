import fc from 'fast-check';
import {
  NamespaceConfig,
  type NamespaceConfigData,
  type NamespaceConfigError,
} from './namespace-config';
import { directUserset, type Userset } from './userset';

const validData: NamespaceConfigData = {
  relations: ['owner', 'editor', 'viewer'],
  actions: { read: ['viewer', 'editor', 'owner'], write: ['editor', 'owner'] },
};

const rewriteData: NamespaceConfigData = {
  relations: ['owner', 'editor', 'viewer', 'parent'],
  actions: { read: ['viewer'], write: ['editor'] },
  rewrites: {
    editor: {
      kind: 'union',
      children: [{ kind: 'this' }, { kind: 'computedUserset', relation: 'owner' }],
    },
    viewer: {
      kind: 'union',
      children: [
        { kind: 'this' },
        { kind: 'computedUserset', relation: 'editor' },
        { kind: 'tupleToUserset', tupleset: 'parent', computedUserset: 'viewer' },
      ],
    },
  },
};

function unwrap(data: NamespaceConfigData): NamespaceConfig {
  const result = NamespaceConfig.create(data);
  if (!result.ok) throw new Error(`expected a valid config, got ${result.error}`);
  return result.value;
}

describe('NamespaceConfig', () => {
  it('accepts a well-formed config', () => {
    expect(NamespaceConfig.create(validData).ok).toBe(true);
  });

  it('accepts a config with computed_userset, tuple_to_userset, and union rewrites', () => {
    expect(NamespaceConfig.create(rewriteData).ok).toBe(true);
  });

  it.each<[NamespaceConfigData, NamespaceConfigError]>([
    [{ relations: [], actions: {} }, 'empty_relations'],
    [{ relations: ['own er'], actions: {} }, 'invalid_relation'],
    [{ relations: ['owner', 'owner'], actions: {} }, 'duplicate_relation'],
    [{ relations: ['owner'], actions: { 're ad': ['owner'] } }, 'invalid_verb'],
    [{ relations: ['owner'], actions: { read: [] } }, 'empty_binding'],
    [{ relations: ['owner'], actions: { read: ['viewer'] } }, 'unknown_relation'],
    [
      { relations: ['viewer'], actions: {}, rewrites: { editor: directUserset } },
      'unknown_rewrite_relation',
    ],
    [
      {
        relations: ['viewer'],
        actions: {},
        rewrites: { viewer: { kind: 'computedUserset', relation: 'editor' } },
      },
      'unknown_rewrite_relation',
    ],
    [
      {
        relations: ['viewer'],
        actions: {},
        rewrites: {
          viewer: { kind: 'tupleToUserset', tupleset: 'parent', computedUserset: 'viewer' },
        },
      },
      'unknown_rewrite_relation',
    ],
    [
      { relations: ['viewer'], actions: {}, rewrites: { viewer: { kind: 'union', children: [] } } },
      'invalid_rewrite',
    ],
    [
      {
        relations: ['viewer'],
        actions: {},
        rewrites: { viewer: { kind: 'computedUserset', relation: 'no space' } },
      },
      'invalid_rewrite',
    ],
    [
      {
        relations: ['viewer', 'parent'],
        actions: {},
        rewrites: {
          viewer: { kind: 'tupleToUserset', tupleset: 'parent', computedUserset: 'no space' },
        },
      },
      'invalid_rewrite',
    ],
    [
      {
        relations: ['viewer'],
        actions: {},
        rewrites: {
          viewer: { kind: 'union', children: [{ kind: 'computedUserset', relation: 'ghost' }] },
        },
      },
      'unknown_rewrite_relation',
    ],
    [
      {
        relations: ['viewer'],
        actions: {},
        rewrites: { viewer: { kind: 'computedUserset', relation: 'viewer' } },
      },
      'cyclic_computed_userset',
    ],
    [
      {
        relations: ['viewer', 'editor'],
        actions: {},
        rewrites: {
          viewer: { kind: 'computedUserset', relation: 'editor' },
          editor: { kind: 'computedUserset', relation: 'viewer' },
        },
      },
      'cyclic_computed_userset',
    ],
  ])('rejects a config with %o as %s', (data, expected) => {
    const result = NamespaceConfig.create(data);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(expected);
  });

  it('allows a tuple_to_userset whose computed relation is not local (cross-namespace)', () => {
    const result = NamespaceConfig.create({
      relations: ['parent'],
      actions: {},
      rewrites: {
        parent: { kind: 'tupleToUserset', tupleset: 'parent', computedUserset: 'viewer' },
      },
    });
    expect(result.ok).toBe(true);
  });

  it('resolves a verb to its bound relations and reports membership', () => {
    const config = unwrap(validData);
    expect(config.requiredRelationsForVerb('read')).toEqual(['viewer', 'editor', 'owner']);
    expect(config.requiredRelationsForVerb('delete')).toEqual([]);
    expect(config.hasRelation('owner')).toBe(true);
    expect(config.hasRelation('nope')).toBe(false);
  });

  it('exposes a relation rewrite and defaults missing ones to direct tuples', () => {
    const config = unwrap(rewriteData);
    expect(config.rewritesFor('viewer')).toEqual(rewriteData.rewrites?.viewer);
    expect(config.rewritesFor('owner')).toEqual(directUserset);
  });

  it('reads a Slice-3 direct-only config unchanged and treats every relation as direct', () => {
    const config = NamespaceConfig.fromData(validData);
    expect(config.rewritesFor('viewer')).toEqual(directUserset);
    expect(config.toData()).toEqual(validData);
  });

  it('omits an empty rewrites map from serialization', () => {
    expect(unwrap(validData).toData().rewrites).toBeUndefined();
  });

  it('round-trips a config with rewrites through toData/fromData', () => {
    const created = unwrap(rewriteData);
    expect(NamespaceConfig.fromData(created.toData()).toData()).toEqual(rewriteData);
  });

  it('round-trips any rewrite tree through fromData/toData (property)', () => {
    const relation = fc.constantFrom('owner', 'editor', 'viewer', 'parent');
    const { userset } = fc.letrec<{ userset: Userset }>((tie) => ({
      userset: fc.oneof(
        { depthSize: 'small', withCrossShrink: true },
        fc.constant<Userset>({ kind: 'this' }),
        relation.map((r): Userset => ({ kind: 'computedUserset', relation: r })),
        fc.tuple(relation, relation).map(([tupleset, computed]): Userset => ({
          kind: 'tupleToUserset',
          tupleset,
          computedUserset: computed,
        })),
        fc
          .array(tie('userset'), { minLength: 1, maxLength: 3 })
          .map((children): Userset => ({ kind: 'union', children })),
      ),
    }));

    fc.assert(
      fc.property(userset, (tree) => {
        const data: NamespaceConfigData = {
          relations: ['owner', 'editor', 'viewer', 'parent'],
          actions: {},
          rewrites: { viewer: tree },
        };
        expect(NamespaceConfig.fromData(data).toData()).toEqual(data);
      }),
    );
  });
});
