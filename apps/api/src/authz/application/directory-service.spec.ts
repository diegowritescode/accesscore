import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { NamespaceConfig } from '../domain/namespace-config';
import { NamespaceDefinition } from '../domain/namespace-definition';
import { type Policy } from '../domain/policy/policy';
import { type NamespaceDefinitionsRepository } from '../domain/ports/namespace-definitions-repository';
import { type PoliciesRepository } from '../domain/ports/policies-repository';
import { type RelationTupleStore, type TupleFilter } from '../domain/ports/relation-tuple-store';
import { RelationTuple } from '../domain/relation-tuple';
import { AuthzDirectoryService } from './directory-service';

const now = new Date('2026-07-12T00:00:00.000Z');
const orgId = OrgId.generate();

const document = ((): NamespaceDefinition => {
  const config = NamespaceConfig.create({
    relations: ['owner', 'editor', 'viewer'],
    actions: { read: ['viewer'], write: ['editor'] },
    rewrites: { viewer: { kind: 'computedUserset', relation: 'editor' } },
  });
  if (!config.ok) {
    throw new Error('invalid config');
  }
  return NamespaceDefinition.define({
    orgId,
    namespace: 'document',
    config: config.value,
    revision: Revision.fromValue(5),
    createdAt: now,
  });
})();

class StubNamespaces implements NamespaceDefinitionsRepository {
  constructor(private readonly defs: NamespaceDefinition[]) {}
  save(): Promise<void> {
    return Promise.resolve();
  }
  findByNamespace(_org: OrgId, namespace: string): Promise<NamespaceDefinition | null> {
    return Promise.resolve(this.defs.find((def) => def.namespace === namespace) ?? null);
  }
  listByOrg(): Promise<NamespaceDefinition[]> {
    return Promise.resolve(this.defs);
  }
}

class StubTuples implements RelationTupleStore {
  received: TupleFilter | null = null;
  constructor(private readonly tuples: RelationTuple[]) {}
  upsert(): Promise<void> {
    return Promise.resolve();
  }
  delete(): Promise<number> {
    return Promise.resolve(0);
  }
  listByObject(): Promise<RelationTuple[]> {
    return Promise.resolve([]);
  }
  list(filter: TupleFilter): Promise<RelationTuple[]> {
    this.received = filter;
    return Promise.resolve(this.tuples);
  }
}

class StubPolicies implements PoliciesRepository {
  constructor(private readonly policies: Policy[]) {}
  upsert(): Promise<void> {
    return Promise.resolve();
  }
  deleteById(): Promise<boolean> {
    return Promise.resolve(false);
  }
  listByTarget(): Promise<Policy[]> {
    return Promise.resolve([]);
  }
  listByOrg(): Promise<Policy[]> {
    return Promise.resolve(this.policies);
  }
}

const tuple = (
  object: string,
  relation: string,
  subject: RelationTuple['subject'],
  revision: number,
): RelationTuple =>
  RelationTuple.reconstitute({
    orgId,
    object: { type: 'document', id: object },
    relation,
    subject,
    revision: Revision.fromValue(revision),
    createdAt: now,
  });

describe('AuthzDirectoryService', () => {
  it('summarizes namespaces with their relations and action verbs', async () => {
    const service = new AuthzDirectoryService(
      new StubNamespaces([document]),
      new StubTuples([]),
      new StubPolicies([]),
    );

    const summaries = await service.listNamespaces(orgId);

    expect(summaries).toEqual([
      {
        namespace: 'document',
        relations: ['owner', 'editor', 'viewer'],
        actions: ['read', 'write'],
        revision: 5,
      },
    ]);
  });

  it('describes a namespace with its action bindings and rewrites', async () => {
    const service = new AuthzDirectoryService(
      new StubNamespaces([document]),
      new StubTuples([]),
      new StubPolicies([]),
    );

    const detail = await service.getNamespace(orgId, 'document');

    expect(detail).toEqual({
      namespace: 'document',
      relations: ['owner', 'editor', 'viewer'],
      actions: { read: ['viewer'], write: ['editor'] },
      rewrites: { viewer: { kind: 'computedUserset', relation: 'editor' } },
      revision: 5,
    });
  });

  it('returns null when the namespace does not exist', async () => {
    const service = new AuthzDirectoryService(
      new StubNamespaces([document]),
      new StubTuples([]),
      new StubPolicies([]),
    );

    expect(await service.getNamespace(orgId, 'folder')).toBeNull();
  });

  it('maps subject and userset tuples, passing the parsed filter to the store', async () => {
    const tuples = new StubTuples([
      tuple('onboarding', 'viewer', { kind: 'subject', ref: { type: 'user', id: 'bob' } }, 3),
      tuple(
        'onboarding',
        'viewer',
        { kind: 'userset', ref: { type: 'group', id: 'eng' }, relation: 'member' },
        4,
      ),
    ]);
    const service = new AuthzDirectoryService(new StubNamespaces([]), tuples, new StubPolicies([]));

    const views = await service.listTuples(orgId, {
      namespace: 'document',
      relation: 'viewer',
      subject: { type: 'group', id: 'eng', relation: 'member' },
      limit: 25,
      offset: 10,
    });

    expect(tuples.received).toEqual({
      orgId,
      namespace: 'document',
      objectId: undefined,
      relation: 'viewer',
      subject: { kind: 'userset', ref: { type: 'group', id: 'eng' }, relation: 'member' },
      limit: 25,
      offset: 10,
    });
    expect(views).toEqual([
      {
        object: { type: 'document', id: 'onboarding' },
        relation: 'viewer',
        subject: { type: 'user', id: 'bob' },
        revision: 3,
      },
      {
        object: { type: 'document', id: 'onboarding' },
        relation: 'viewer',
        subject: { type: 'group', id: 'eng', relation: 'member' },
        revision: 4,
      },
    ]);
  });

  it('converts a bare subject filter to a subject ref', async () => {
    const tuples = new StubTuples([]);
    const service = new AuthzDirectoryService(new StubNamespaces([]), tuples, new StubPolicies([]));

    await service.listTuples(orgId, {
      subject: { type: 'user', id: 'bob' },
      limit: 50,
      offset: 0,
    });

    expect(tuples.received?.subject).toEqual({
      kind: 'subject',
      ref: { type: 'user', id: 'bob' },
    });
  });

  it('lists policies with their effect, target and condition', async () => {
    const policy: Policy = {
      id: 'require-mfa',
      orgId,
      effect: 'forbid',
      resourceType: 'document',
      action: 'read',
      condition: {
        kind: 'cmp',
        op: 'lt',
        left: { kind: 'attr', path: 'principal.aal' },
        right: { kind: 'lit', value: 2 },
      },
      revision: Revision.fromValue(7),
    };
    const service = new AuthzDirectoryService(
      new StubNamespaces([]),
      new StubTuples([]),
      new StubPolicies([policy]),
    );

    const views = await service.listPolicies(orgId);

    expect(views).toEqual([
      {
        id: 'require-mfa',
        effect: 'forbid',
        resourceType: 'document',
        action: 'read',
        condition: policy.condition,
        revision: 7,
      },
    ]);
  });
});
