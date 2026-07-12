import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { Action } from './action';
import { NamespaceConfig } from './namespace-config';
import { NamespaceDefinition } from './namespace-definition';

describe('NamespaceDefinition', () => {
  const config = NamespaceConfig.create({
    relations: ['owner', 'editor', 'viewer'],
    actions: { read: ['viewer', 'editor', 'owner'] },
  });
  if (!config.ok) {
    throw new Error('expected a valid config');
  }
  const definition = NamespaceDefinition.define({
    orgId: OrgId.generate(),
    namespace: 'document',
    config: config.value,
    revision: Revision.fromValue(1),
    createdAt: new Date('2026-07-12T00:00:00.000Z'),
  });

  it('resolves an action to the relations bound in its namespace', () => {
    expect(definition.requiredRelationsFor(Action.of('document.read'))).toEqual([
      'viewer',
      'editor',
      'owner',
    ]);
  });

  it('returns no relations for an action in a different namespace', () => {
    expect(definition.requiredRelationsFor(Action.of('folder.read'))).toEqual([]);
  });

  it('returns no relations for an unbound verb', () => {
    expect(definition.requiredRelationsFor(Action.of('document.delete'))).toEqual([]);
  });
});
