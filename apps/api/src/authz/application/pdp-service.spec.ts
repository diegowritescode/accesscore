import { type Clock } from '../../shared/kernel/clock';
import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';
import { type Tx, type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { Action } from '../domain/action';
import { type Principal, type RequestContext } from '../domain/authorization-request';
import { ConsistencyToken } from '../domain/consistency-token';
import { type EntityRef } from '../domain/entity-ref';
import { NamespaceConfig } from '../domain/namespace-config';
import { NamespaceDefinition } from '../domain/namespace-definition';
import { type DecisionLog, type DecisionLogRecord } from '../domain/ports/decision-log';
import {
  type ObjectRelationQuery,
  type RelationTupleKey,
  type RelationTupleStore,
} from '../domain/ports/relation-tuple-store';
import { type NamespaceDefinitionsRepository } from '../domain/ports/namespace-definitions-repository';
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
}

class RecordingDecisionLog implements DecisionLog {
  readonly records: DecisionLogRecord[] = [];
  record(entry: DecisionLogRecord): Promise<void> {
    this.records.push(entry);
    return Promise.resolve();
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
  revision?: number;
}): { pdp: PdpService; log: RecordingDecisionLog } {
  const log = new RecordingDecisionLog();
  const pdp = new PdpService(
    new FakeNamespaces(options.definition ?? null),
    new FakeTuples(options.tuples ?? []),
    new FakeRevisions(options.revision ?? 0),
    log,
    new ImmediateUnitOfWork(),
    clock,
  );
  return { pdp, log };
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
});
