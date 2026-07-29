import { type Clock } from '../../shared/kernel/clock';
import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';
import { type Tx, type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { Action } from '../domain/action';
import { type Principal, type RequestContext } from '../domain/authorization-request';
import { ConsistencyToken } from '../domain/consistency-token';
import { type EntityRef } from '../domain/entity-ref';
import { type Decision } from '../domain/decision';
import { NamespaceConfig } from '../domain/namespace-config';
import { NamespaceDefinition } from '../domain/namespace-definition';
import { type DecisionCache, type DecisionCacheKey } from '../domain/ports/decision-cache';
import { type DecisionLog, type DecisionLogRecord } from '../domain/ports/decision-log';
import {
  type ObjectRelationQuery,
  type RelationTupleKey,
  type RelationTupleStore,
} from '../domain/ports/relation-tuple-store';
import { type NamespaceDefinitionsRepository } from '../domain/ports/namespace-definitions-repository';
import { type PoliciesRepository } from '../domain/ports/policies-repository';
import { type Condition } from '../domain/policy/condition';
import { ANY_ACTION, type Policy } from '../domain/policy/policy';
import { RelationTuple } from '../domain/relation-tuple';
import { type SubjectRef } from '../domain/subject-ref';
import { PdpService } from './pdp-service';

const now = new Date('2026-07-12T00:00:00.000Z');

class ImmediateUnitOfWork implements UnitOfWork {
  withTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return work({ executor: Symbol('tx') });
  }
}

class FakeRevisions implements RevisionsRepository {
  constructor(private readonly value: number) {}
  allocate(): Promise<Revision> {
    return Promise.resolve(Revision.fromValue(this.value));
  }
  current(): Promise<Revision> {
    return Promise.resolve(Revision.fromValue(this.value));
  }
}

class FakeNamespaces implements NamespaceDefinitionsRepository {
  constructor(private readonly definition: NamespaceDefinition | null) {}
  save(): Promise<void> {
    return Promise.resolve();
  }
  findByNamespace(): Promise<NamespaceDefinition | null> {
    return Promise.resolve(this.definition);
  }
  listByOrg(): Promise<NamespaceDefinition[]> {
    return Promise.resolve(this.definition ? [this.definition] : []);
  }
}

class FakeTuples implements RelationTupleStore {
  constructor(private readonly tuples: RelationTuple[] = []) {}
  upsert(): Promise<void> {
    return Promise.resolve();
  }
  delete(_key: RelationTupleKey): Promise<number> {
    return Promise.resolve(0);
  }
  listByObject(query: ObjectRelationQuery): Promise<RelationTuple[]> {
    return Promise.resolve(
      this.tuples.filter(
        (t) =>
          t.object.type === query.object.type &&
          t.object.id === query.object.id &&
          t.relation === query.relation,
      ),
    );
  }
  list(): Promise<RelationTuple[]> {
    return Promise.resolve(this.tuples);
  }
}

class RecordingDecisionLog implements DecisionLog {
  readonly records: DecisionLogRecord[] = [];
  record(entry: DecisionLogRecord): Promise<void> {
    this.records.push(entry);
    return Promise.resolve();
  }
}

class FakeDecisionCache implements DecisionCache {
  readonly store = new Map<string, Decision>();
  gets = 0;
  sets = 0;
  private keyOf(key: DecisionCacheKey): string {
    return `${key.orgId.value}:${key.revision.value}:${key.subject}:${key.action}:${key.resource}`;
  }
  get(key: DecisionCacheKey): Promise<Decision | null> {
    this.gets += 1;
    return Promise.resolve(this.store.get(this.keyOf(key)) ?? null);
  }
  set(key: DecisionCacheKey, decision: Decision): Promise<void> {
    this.sets += 1;
    this.store.set(this.keyOf(key), decision);
    return Promise.resolve();
  }
}

class FakePolicies implements PoliciesRepository {
  constructor(private readonly policies: Policy[] = []) {}
  upsert(): Promise<void> {
    return Promise.resolve();
  }
  deleteById(): Promise<boolean> {
    return Promise.resolve(false);
  }
  listByTarget(_orgId: OrgId, resourceType: string, action: string): Promise<Policy[]> {
    return Promise.resolve(
      this.policies.filter(
        (policy) =>
          policy.resourceType === resourceType &&
          (policy.action === action || policy.action === ANY_ACTION),
      ),
    );
  }
  listByOrg(): Promise<Policy[]> {
    return Promise.resolve(this.policies);
  }
}

const clock: Clock = { now: () => now };
const orgId = OrgId.generate();

function namespaceDef(org = orgId): NamespaceDefinition {
  const config = NamespaceConfig.create({ relations: ['viewer'], actions: { read: ['viewer'] } });
  if (!config.ok) {
    throw new Error('invalid config');
  }
  return NamespaceDefinition.define({
    orgId: org,
    namespace: 'document',
    config: config.value,
    revision: Revision.fromValue(1),
    createdAt: now,
  });
}

function aliasNamespaceDef(org = orgId): NamespaceDefinition {
  const config = NamespaceConfig.create({
    relations: ['editor', 'viewer'],
    actions: { read: ['viewer'] },
    rewrites: {
      viewer: {
        kind: 'union',
        children: [{ kind: 'this' }, { kind: 'computedUserset', relation: 'editor' }],
      },
    },
  });
  if (!config.ok) {
    throw new Error('invalid config');
  }
  return NamespaceDefinition.define({
    orgId: org,
    namespace: 'document',
    config: config.value,
    revision: Revision.fromValue(1),
    createdAt: now,
  });
}

function inheritNamespaceDef(org = orgId): NamespaceDefinition {
  const config = NamespaceConfig.create({
    relations: ['viewer', 'parent'],
    actions: { read: ['viewer'] },
    rewrites: {
      viewer: {
        kind: 'union',
        children: [
          { kind: 'this' },
          { kind: 'tupleToUserset', tupleset: 'parent', computedUserset: 'viewer' },
        ],
      },
    },
  });
  if (!config.ok) {
    throw new Error('invalid config');
  }
  return NamespaceDefinition.define({
    orgId: org,
    namespace: 'document',
    config: config.value,
    revision: Revision.fromValue(1),
    createdAt: now,
  });
}

function objectTuple(object: EntityRef, relation: string, subject: SubjectRef): RelationTuple {
  return RelationTuple.write({
    orgId,
    object,
    relation,
    subject,
    revision: Revision.fromValue(1),
    createdAt: now,
  });
}

function tuple(relation: string, subject: SubjectRef): RelationTuple {
  return RelationTuple.write({
    orgId,
    object: { type: 'document', id: '1' },
    relation,
    subject,
    revision: Revision.fromValue(1),
    createdAt: now,
  });
}

const resource: EntityRef = { type: 'document', id: '1' };
const alice: EntityRef = { type: 'user', id: 'alice' };
const read = Action.of('document.read');

const principal = (org: string | null, subject: EntityRef = alice): Principal => ({
  subject,
  orgId: org,
  assuranceLevel: 1,
  sessionId: 'sid-1',
});

const fullContext: RequestContext = {
  ip: '203.0.113.9',
  requestId: 'req-1',
  requestedAt: now,
  consistency: { mode: 'full' },
};

function build(options: {
  definition?: NamespaceDefinition | null;
  tuples?: RelationTuple[];
  policies?: Policy[];
  revision?: number;
  cache?: FakeDecisionCache;
}): {
  pdp: PdpService;
  log: RecordingDecisionLog;
  cache: FakeDecisionCache;
  tuples: FakeTuples;
} {
  const log = new RecordingDecisionLog();
  const cache = options.cache ?? new FakeDecisionCache();
  const tuples = new FakeTuples(options.tuples ?? []);
  const pdp = new PdpService(
    new FakeNamespaces(options.definition ?? null),
    tuples,
    new FakePolicies(options.policies ?? []),
    new FakeRevisions(options.revision ?? 0),
    log,
    new ImmediateUnitOfWork(),
    clock,
    cache,
  );
  return { pdp, log, cache, tuples };
}

describe('PdpService', () => {
  it('permits when a relationship grants the action and logs the decision', async () => {
    const { pdp, log } = build({
      definition: namespaceDef(),
      tuples: [tuple('viewer', { kind: 'subject', ref: alice })],
      revision: 5,
    });

    const decision = await pdp.check(principal(orgId.value), read, resource, fullContext);

    expect(decision.effect).toBe('permit');
    expect(log.records).toHaveLength(1);
    const record = log.records[0];
    expect(record?.effect).toBe('permit');
    expect(record?.subject).toBe('user:alice');
    expect(record?.action).toBe('document.read');
    expect(record?.resource).toBe('document:1');
    expect(record?.revisionUsed.value).toBe(5);
    expect(record?.orgId?.value).toBe(orgId.value);
  });

  it('lets a forbid policy override a relationship permit, gated by the trusted context', async () => {
    const forbid: Policy = {
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
      } satisfies Condition,
      revision: Revision.fromValue(0),
    };
    const { pdp } = build({
      definition: namespaceDef(),
      tuples: [tuple('viewer', { kind: 'subject', ref: alice })],
      policies: [forbid],
    });

    const lowAssurance = await pdp.check(
      { ...principal(orgId.value), assuranceLevel: 1 },
      read,
      resource,
      fullContext,
    );
    expect(lowAssurance.effect).toBe('deny');
    expect(lowAssurance.reasons[0]?.code).toBe('forbid_matched');

    const stepped = await pdp.check(
      { ...principal(orgId.value), assuranceLevel: 3 },
      read,
      resource,
      fullContext,
    );
    expect(stepped.effect).toBe('permit');
  });

  it('simulate returns the live and proposed decisions and writes no decision log', async () => {
    const { pdp, log } = build({
      definition: namespaceDef(),
      tuples: [tuple('viewer', { kind: 'subject', ref: alice })],
    });
    const overlay: Policy[] = [
      {
        id: 'proposed',
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
        revision: Revision.fromValue(0),
      },
    ];

    const result = await pdp.simulate(
      { ...principal(orgId.value), assuranceLevel: 1 },
      read,
      resource,
      fullContext,
      overlay,
    );

    expect(result.live.effect).toBe('permit');
    expect(result.decision.effect).toBe('deny');
    expect(result.changed).toBe(true);
    expect(log.records).toHaveLength(0);
  });

  it('denies by default when nothing grants the action, and logs it', async () => {
    const { pdp, log } = build({ definition: namespaceDef(), tuples: [], revision: 3 });

    const decision = await pdp.check(principal(orgId.value), read, resource, fullContext);

    expect(decision.effect).toBe('deny');
    expect(log.records[0]?.effect).toBe('deny');
    expect(log.records[0]?.revisionUsed.value).toBe(3);
  });

  it('denies a principal with no organization context', async () => {
    const { pdp, log } = build({ definition: namespaceDef(), revision: 3 });

    const decision = await pdp.check(principal(null), read, resource, fullContext);

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('no_org_context');
    expect(log.records[0]?.orgId).toBeNull();
  });

  it('fails closed when the store has not caught up to the consistency token', async () => {
    const { pdp, log } = build({
      definition: namespaceDef(),
      tuples: [tuple('viewer', { kind: 'subject', ref: alice })],
      revision: 4,
    });
    const staleZookie = ConsistencyToken.fromRevision(Revision.fromValue(10)).encode();

    const decision = await pdp.check(principal(orgId.value), read, resource, {
      ...fullContext,
      consistency: { mode: 'at-least', token: staleZookie },
    });

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('consistency_unavailable');
    expect(log.records[0]?.effect).toBe('deny');
  });

  it('resolves a grant through one userset level', async () => {
    const { pdp } = build({
      definition: namespaceDef(),
      tuples: [
        tuple('viewer', { kind: 'userset', ref: { type: 'group', id: 'eng' }, relation: 'member' }),
        RelationTuple.write({
          orgId,
          object: { type: 'group', id: 'eng' },
          relation: 'member',
          subject: { kind: 'subject', ref: alice },
          revision: Revision.fromValue(1),
          createdAt: now,
        }),
      ],
      revision: 6,
    });

    const decision = await pdp.check(principal(orgId.value), read, resource, fullContext);

    expect(decision.effect).toBe('permit');
  });

  it('resolves a grant through a computed_userset rewrite (loads the aliased relation)', async () => {
    const { pdp } = build({
      definition: aliasNamespaceDef(),
      tuples: [tuple('editor', { kind: 'subject', ref: alice })],
      revision: 7,
    });

    const decision = await pdp.check(principal(orgId.value), read, resource, fullContext);

    expect(decision.effect).toBe('permit');
    expect(decision.reasons[0]?.code).toBe('grant.computed_userset');
  });

  it('expands a computed_userset alias to its members', async () => {
    const { pdp } = build({
      definition: aliasNamespaceDef(),
      tuples: [tuple('editor', { kind: 'subject', ref: alice })],
      revision: 2,
    });

    const members = await pdp.expand(principal(orgId.value), resource, 'viewer');

    expect(members.map((member) => member.id)).toEqual(['alice']);
  });

  it('resolves a grant through a tuple_to_userset rewrite (loads the parent hop)', async () => {
    const folder: EntityRef = { type: 'folder', id: 'f1' };
    const { pdp } = build({
      definition: inheritNamespaceDef(),
      tuples: [
        objectTuple(resource, 'parent', { kind: 'subject', ref: folder }),
        objectTuple(folder, 'viewer', { kind: 'subject', ref: alice }),
      ],
      revision: 8,
    });

    const decision = await pdp.check(principal(orgId.value), read, resource, fullContext);

    expect(decision.effect).toBe('permit');
    expect(decision.reasons[0]?.code).toBe('grant.tuple_to_userset');
  });

  it('resolves a grant through nested groups beyond one level', async () => {
    const g0: EntityRef = { type: 'group', id: 'g0' };
    const g1: EntityRef = { type: 'group', id: 'g1' };
    const { pdp } = build({
      definition: namespaceDef(),
      tuples: [
        tuple('viewer', { kind: 'userset', ref: g0, relation: 'member' }),
        objectTuple(g0, 'member', { kind: 'userset', ref: g1, relation: 'member' }),
        objectTuple(g1, 'member', { kind: 'subject', ref: alice }),
      ],
      revision: 9,
    });

    const decision = await pdp.check(principal(orgId.value), read, resource, fullContext);

    expect(decision.effect).toBe('permit');
  });

  it('returns one decision per request in a batch and logs each', async () => {
    const { pdp, log } = build({
      definition: namespaceDef(),
      tuples: [tuple('viewer', { kind: 'subject', ref: alice })],
      revision: 5,
    });
    const write = Action.of('document.write');

    const decisions = await pdp.batchCheck([
      { principal: principal(orgId.value), action: read, resource, context: fullContext },
      { principal: principal(orgId.value), action: write, resource, context: fullContext },
    ]);

    expect(decisions.map((decision) => decision.effect)).toEqual(['permit', 'deny']);
    expect(log.records).toHaveLength(2);
  });

  it('returns no decisions for an empty batch', async () => {
    const { pdp } = build({ definition: namespaceDef() });

    expect(await pdp.batchCheck([])).toEqual([]);
  });

  it('terminates loadClosure on a cyclic group graph and denies', async () => {
    const g0: EntityRef = { type: 'group', id: 'g0' };
    const g1: EntityRef = { type: 'group', id: 'g1' };
    const { pdp } = build({
      definition: namespaceDef(),
      tuples: [
        tuple('viewer', { kind: 'userset', ref: g0, relation: 'member' }),
        objectTuple(g0, 'member', { kind: 'userset', ref: g1, relation: 'member' }),
        objectTuple(g1, 'member', { kind: 'userset', ref: g0, relation: 'member' }),
      ],
      revision: 4,
    });

    const decision = await pdp.check(principal(orgId.value), read, resource, fullContext);

    expect(decision.effect).toBe('deny');
  });

  it('batchCheck evaluates its misses against one shared snapshot', async () => {
    const tuples = new FakeTuples([tuple('viewer', { kind: 'subject', ref: alice })]);
    const revisions = new FakeRevisions(5);
    const listSpy = jest.spyOn(tuples, 'listByObject');
    const log = new RecordingDecisionLog();
    const pdp = new PdpService(
      new FakeNamespaces(namespaceDef()),
      tuples,
      new FakePolicies(),
      revisions,
      log,
      new ImmediateUnitOfWork(),
      clock,
      new FakeDecisionCache(),
    );

    const decisions = await pdp.batchCheck([
      { principal: principal(orgId.value), action: read, resource, context: fullContext },
      { principal: principal(orgId.value), action: read, resource, context: fullContext },
    ]);

    expect(decisions.map((decision) => decision.effect)).toEqual(['permit', 'permit']);
    const viewerLoads = listSpy.mock.calls.filter(
      ([query]) => query.object.type === 'document' && query.relation === 'viewer',
    );
    expect(viewerLoads).toHaveLength(1);
    expect(log.records).toHaveLength(2);
  });

  it('batchCheck gates each query on consistency independently', async () => {
    const { pdp } = build({
      definition: namespaceDef(),
      tuples: [tuple('viewer', { kind: 'subject', ref: alice })],
      revision: 5,
    });
    const aheadToken = ConsistencyToken.fromRevision(Revision.fromValue(10)).encode();

    const decisions = await pdp.batchCheck([
      { principal: principal(orgId.value), action: read, resource, context: fullContext },
      {
        principal: principal(orgId.value),
        action: read,
        resource,
        context: { ...fullContext, consistency: { mode: 'at-least', token: aheadToken } },
      },
    ]);

    expect(decisions[0]?.effect).toBe('permit');
    expect(decisions[1]?.effect).toBe('deny');
    expect(decisions[1]?.reasons[0]?.code).toBe('consistency_unavailable');
  });

  it('batchCheck yields the same decisions as individual checks', async () => {
    const bob: EntityRef = { type: 'user', id: 'bob' };
    const options = {
      definition: namespaceDef(),
      tuples: [tuple('viewer', { kind: 'subject', ref: alice })],
      revision: 5,
    };
    const batch = await build(options).pdp.batchCheck([
      { principal: principal(orgId.value, alice), action: read, resource, context: fullContext },
      { principal: principal(orgId.value, bob), action: read, resource, context: fullContext },
    ]);
    const solo = build(options);
    const soloAlice = await solo.pdp.check(
      principal(orgId.value, alice),
      read,
      resource,
      fullContext,
    );
    const soloBob = await solo.pdp.check(principal(orgId.value, bob), read, resource, fullContext);

    expect(batch.map((decision) => decision.effect)).toEqual([soloAlice.effect, soloBob.effect]);
    expect(batch.map((decision) => decision.effect)).toEqual(['permit', 'deny']);
  });

  it('expands the direct members of a relation', async () => {
    const bob: EntityRef = { type: 'user', id: 'bob' };
    const { pdp } = build({
      tuples: [
        tuple('viewer', { kind: 'subject', ref: alice }),
        tuple('viewer', { kind: 'subject', ref: bob }),
      ],
      revision: 2,
    });

    const members = await pdp.expand(principal(orgId.value), resource, 'viewer');

    expect(members.map((member) => member.id).sort()).toEqual(['alice', 'bob']);
  });

  it('expands members through one userset level', async () => {
    const { pdp } = build({
      tuples: [
        tuple('viewer', { kind: 'userset', ref: { type: 'group', id: 'eng' }, relation: 'member' }),
        RelationTuple.write({
          orgId,
          object: { type: 'group', id: 'eng' },
          relation: 'member',
          subject: { kind: 'subject', ref: alice },
          revision: Revision.fromValue(1),
          createdAt: now,
        }),
      ],
      revision: 2,
    });

    const members = await pdp.expand(principal(orgId.value), resource, 'viewer');

    expect(members).toEqual([alice]);
  });

  it('expands to nothing for a principal with no organization', async () => {
    const { pdp } = build({ tuples: [tuple('viewer', { kind: 'subject', ref: alice })] });

    const members = await pdp.expand(principal(null), resource, 'viewer');

    expect(members).toEqual([]);
  });

  describe('decision cache', () => {
    it('serves a warm hit without touching the tuple store, identical to the cold miss, logging both', async () => {
      const { pdp, cache, tuples, log } = build({
        definition: namespaceDef(),
        tuples: [tuple('viewer', { kind: 'subject', ref: alice })],
        revision: 5,
      });
      const listSpy = jest.spyOn(tuples, 'listByObject');

      const cold = await pdp.check(principal(orgId.value), read, resource, fullContext);
      expect(cold.effect).toBe('permit');
      expect(cache.sets).toBe(1);
      const loadsAfterCold = listSpy.mock.calls.length;
      expect(loadsAfterCold).toBeGreaterThan(0);

      const warm = await pdp.check(principal(orgId.value), read, resource, fullContext);
      expect(warm).toEqual(cold);
      expect(listSpy.mock.calls.length).toBe(loadsAfterCold);
      expect(log.records).toHaveLength(2);
    });

    it('caches a pure-ReBAC deny as well as a permit', async () => {
      const { pdp, cache, tuples } = build({ definition: namespaceDef(), revision: 5 });
      const listSpy = jest.spyOn(tuples, 'listByObject');

      const cold = await pdp.check(principal(orgId.value), read, resource, fullContext);
      expect(cold.effect).toBe('deny');
      expect(cache.sets).toBe(1);
      const loadsAfterCold = listSpy.mock.calls.length;

      const warm = await pdp.check(principal(orgId.value), read, resource, fullContext);
      expect(warm).toEqual(cold);
      expect(listSpy.mock.calls.length).toBe(loadsAfterCold);
    });

    it('never caches a decision with an applicable policy (ABAC context-dependence)', async () => {
      const forbid: Policy = {
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
        } satisfies Condition,
        revision: Revision.fromValue(0),
      };
      const { pdp, cache } = build({
        definition: namespaceDef(),
        tuples: [tuple('viewer', { kind: 'subject', ref: alice })],
        policies: [forbid],
        revision: 5,
      });

      await pdp.check(principal(orgId.value), read, resource, fullContext);
      await pdp.check(principal(orgId.value), read, resource, fullContext);

      expect(cache.sets).toBe(0);
      expect(cache.store.size).toBe(0);
    });

    it('does not serve a stale permit after a write advances the revision', async () => {
      const cache = new FakeDecisionCache();
      const before = build({
        definition: namespaceDef(),
        tuples: [tuple('viewer', { kind: 'subject', ref: alice })],
        revision: 5,
        cache,
      });
      const permit = await before.pdp.check(principal(orgId.value), read, resource, fullContext);
      expect(permit.effect).toBe('permit');

      const after = build({ definition: namespaceDef(), tuples: [], revision: 6, cache });
      const decision = await after.pdp.check(principal(orgId.value), read, resource, fullContext);
      expect(decision.effect).toBe('deny');
    });

    it('bypasses the cache for a bounded-staleness (at-least) request', async () => {
      const { pdp, cache } = build({
        definition: namespaceDef(),
        tuples: [tuple('viewer', { kind: 'subject', ref: alice })],
        revision: 5,
      });
      const atLeast: RequestContext = {
        ...fullContext,
        consistency: {
          mode: 'at-least',
          token: ConsistencyToken.fromRevision(Revision.fromValue(5)).encode(),
        },
      };

      const decision = await pdp.check(principal(orgId.value), read, resource, atLeast);

      expect(decision.effect).toBe('permit');
      expect(cache.gets).toBe(0);
      expect(cache.sets).toBe(0);
    });

    it('does not cache a request without an organization', async () => {
      const { pdp, cache } = build({
        definition: namespaceDef(),
        tuples: [tuple('viewer', { kind: 'subject', ref: alice })],
        revision: 5,
      });

      await pdp.check(principal(null), read, resource, fullContext);

      expect(cache.gets).toBe(0);
      expect(cache.sets).toBe(0);
    });
  });
});
