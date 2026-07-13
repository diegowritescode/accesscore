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

  it.each([
    ['an unsupported intersection node', { kind: 'intersection', children: [{ kind: 'this' }] }],
    ['an unsupported exclusion node', { kind: 'exclusion' }],
    ['an unknown node kind', { kind: 'nonsense' }],
    ['an empty union', { kind: 'union', children: [] }],
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
