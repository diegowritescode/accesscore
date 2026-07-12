import {
  NamespaceConfig,
  type NamespaceConfigData,
  type NamespaceConfigError,
} from './namespace-config';

const validData: NamespaceConfigData = {
  relations: ['owner', 'editor', 'viewer'],
  actions: { read: ['viewer', 'editor', 'owner'], write: ['editor', 'owner'] },
};

describe('NamespaceConfig', () => {
  it('accepts a well-formed config', () => {
    expect(NamespaceConfig.create(validData).ok).toBe(true);
  });

  it.each<[NamespaceConfigData, NamespaceConfigError]>([
    [{ relations: [], actions: {} }, 'empty_relations'],
    [{ relations: ['own er'], actions: {} }, 'invalid_relation'],
    [{ relations: ['owner', 'owner'], actions: {} }, 'duplicate_relation'],
    [{ relations: ['owner'], actions: { 're ad': ['owner'] } }, 'invalid_verb'],
    [{ relations: ['owner'], actions: { read: [] } }, 'empty_binding'],
    [{ relations: ['owner'], actions: { read: ['viewer'] } }, 'unknown_relation'],
  ])('rejects a config with %o as %s', (data, expected) => {
    const result = NamespaceConfig.create(data);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(expected);
  });

  it('resolves a verb to its bound relations and reports membership', () => {
    const result = NamespaceConfig.create(validData);
    if (!result.ok) throw new Error('expected a valid config');
    expect(result.value.requiredRelationsForVerb('read')).toEqual(['viewer', 'editor', 'owner']);
    expect(result.value.requiredRelationsForVerb('delete')).toEqual([]);
    expect(result.value.hasRelation('owner')).toBe(true);
    expect(result.value.hasRelation('nope')).toBe(false);
  });

  it('round-trips through toData/fromData', () => {
    const created = NamespaceConfig.create(validData);
    if (!created.ok) throw new Error('expected a valid config');
    expect(NamespaceConfig.fromData(created.value.toData()).toData()).toEqual(validData);
  });
});
