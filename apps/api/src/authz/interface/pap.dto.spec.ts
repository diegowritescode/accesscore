import { defineNamespaceSchema } from './pap.dto';

describe('defineNamespaceSchema', () => {
  it('accepts a direct-only config without rewrites', () => {
    const result = defineNamespaceSchema.safeParse({
      relations: ['viewer'],
      actions: { read: ['viewer'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a config with this / computed_userset / tuple_to_userset / union rewrites', () => {
    const result = defineNamespaceSchema.safeParse({
      relations: ['owner', 'editor', 'viewer', 'parent'],
      actions: { read: ['viewer'] },
      rewrites: {
        viewer: {
          kind: 'union',
          children: [
            { kind: 'this' },
            { kind: 'computedUserset', relation: 'editor' },
            { kind: 'tupleToUserset', tupleset: 'parent', computedUserset: 'viewer' },
          ],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts intersection and exclusion rewrites (ABAC structural algebra)', () => {
    const result = defineNamespaceSchema.safeParse({
      relations: ['editor', 'suspended', 'viewer'],
      actions: { read: ['viewer'] },
      rewrites: {
        viewer: {
          kind: 'exclusion',
          base: { kind: 'computedUserset', relation: 'editor' },
          subtract: { kind: 'computedUserset', relation: 'suspended' },
        },
        editor: { kind: 'intersection', children: [{ kind: 'this' }] },
      },
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ['an unknown node kind', { kind: 'nonsense' }],
    ['an empty union', { kind: 'union', children: [] }],
    ['an empty intersection', { kind: 'intersection', children: [] }],
    ['an exclusion missing operands', { kind: 'exclusion' }],
    ['a non-identifier relation', { kind: 'computedUserset', relation: 'not valid' }],
  ])('rejects %s', (_label, tree) => {
    const result = defineNamespaceSchema.safeParse({
      relations: ['viewer'],
      actions: { read: ['viewer'] },
      rewrites: { viewer: tree },
    });
    expect(result.success).toBe(false);
  });
});
