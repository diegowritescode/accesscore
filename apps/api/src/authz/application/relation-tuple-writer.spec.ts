import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';
import { type Tx, type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { type EntityRef } from '../domain/entity-ref';
import {
  type RelationTupleChangelog,
  type TupleChange,
} from '../domain/ports/relation-tuple-changelog';
import {
  type ObjectRelationQuery,
  type RelationTupleKey,
  type RelationTupleStore,
} from '../domain/ports/relation-tuple-store';
import { type RelationTuple } from '../domain/relation-tuple';
import { type SubjectRef } from '../domain/subject-ref';
import { RelationTupleWriter } from './relation-tuple-writer';

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('expected a recorded value');
  }
  return value;
}

class SingleTxUnitOfWork implements UnitOfWork {
  readonly tx: Tx = { executor: Symbol('tx') };

  withTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return work(this.tx);
  }
}

class RecordingRevisions implements RevisionsRepository {
  private next = 1;
  readonly seenTx: Tx[] = [];

  allocate(tx: Tx): Promise<Revision> {
    this.seenTx.push(tx);
    return Promise.resolve(Revision.fromValue(this.next++));
  }

  current(): Promise<Revision> {
    return Promise.resolve(Revision.fromValue(this.next - 1));
  }
}

class RecordingStore implements RelationTupleStore {
  readonly upserts: { tuple: RelationTuple; tx?: Tx }[] = [];
  readonly deletes: { key: RelationTupleKey; tx?: Tx }[] = [];
  deleted = 1;

  upsert(tuple: RelationTuple, tx?: Tx): Promise<void> {
    this.upserts.push({ tuple, tx });
    return Promise.resolve();
  }

  delete(key: RelationTupleKey, tx?: Tx): Promise<number> {
    this.deletes.push({ key, tx });
    return Promise.resolve(this.deleted);
  }

  listByObject(_query: ObjectRelationQuery): Promise<RelationTuple[]> {
    return Promise.resolve([]);
  }

  list(): Promise<RelationTuple[]> {
    return Promise.resolve([]);
  }
}

class RecordingChangelog implements RelationTupleChangelog {
  readonly appended: { change: TupleChange; tx: Tx }[] = [];

  append(change: TupleChange, tx: Tx): Promise<void> {
    this.appended.push({ change, tx });
    return Promise.resolve();
  }

  since(): Promise<TupleChange[]> {
    return Promise.resolve([]);
  }
}

describe('RelationTupleWriter', () => {
  const orgId = OrgId.generate();
  const object: EntityRef = { type: 'document', id: 'doc-1' };
  const subject: SubjectRef = { kind: 'subject', ref: { type: 'user', id: 'alice' } };
  const now = new Date('2026-07-12T00:00:00.000Z');
  const command = { orgId, object, relation: 'viewer', subject };

  let store: RecordingStore;
  let revisions: RecordingRevisions;
  let uow: SingleTxUnitOfWork;
  let changelog: RecordingChangelog;
  let writer: RelationTupleWriter;

  beforeEach(() => {
    store = new RecordingStore();
    revisions = new RecordingRevisions();
    uow = new SingleTxUnitOfWork();
    changelog = new RecordingChangelog();
    writer = new RelationTupleWriter(store, revisions, uow, { now: () => now }, changelog);
  });

  it('persists the tuple stamped with the allocated revision and returns that zookie', async () => {
    const token = await writer.write(command);

    expect(store.upserts).toHaveLength(1);
    const persisted = required(store.upserts[0]).tuple;
    expect(persisted.orgId.value).toBe(orgId.value);
    expect(persisted.object).toEqual(object);
    expect(persisted.relation).toBe('viewer');
    expect(persisted.subject).toEqual(subject);
    expect(persisted.revision.value).toBe(1);
    expect(persisted.createdAt).toEqual(now);
    expect(token.revision.value).toBe(1);
  });

  it('allocates the revision and writes the tuple in the same unit of work', async () => {
    await writer.write(command);

    expect(revisions.seenTx).toEqual([uow.tx]);
    expect(required(store.upserts[0]).tx).toBe(uow.tx);
  });

  it('revokes by deleting the keyed tuple and advancing the revision', async () => {
    const token = await writer.revoke(command);

    expect(store.deletes).toHaveLength(1);
    const revoked = required(store.deletes[0]);
    expect(revoked.key).toEqual({ orgId, object, relation: 'viewer', subject });
    expect(revoked.tx).toBe(uow.tx);
    expect(token.revision.value).toBe(1);
  });

  it('records the write in the changelog at the allocated revision, in the same transaction', async () => {
    await writer.write(command);

    expect(changelog.appended).toHaveLength(1);
    const recorded = required(changelog.appended[0]);
    expect(recorded.tx).toBe(uow.tx);
    expect(recorded.change).toEqual({
      orgId,
      revision: Revision.fromValue(1),
      op: 'upsert',
      object,
      relation: 'viewer',
      subject,
      recordedAt: now,
    });
  });

  it('records a revoke as a delete change so watchers see the tombstone', async () => {
    await writer.revoke(command);

    expect(changelog.appended).toHaveLength(1);
    const recorded = required(changelog.appended[0]);
    expect(recorded.tx).toBe(uow.tx);
    expect(recorded.change.op).toBe('delete');
    expect(recorded.change.revision.value).toBe(1);
    expect(recorded.change.subject).toEqual(subject);
  });

  it('records nothing when a revoke matches no tuple, but still advances the revision', async () => {
    store.deleted = 0;

    const token = await writer.revoke(command);

    expect(store.deletes).toHaveLength(1);
    expect(changelog.appended).toHaveLength(0);
    expect(token.revision.value).toBe(1);
  });

  it('keeps the changelog cursor aligned with the zookie across a sequence of writes', async () => {
    const first = await writer.write(command);
    const second = await writer.revoke(command);

    expect(first.revision.value).toBe(1);
    expect(second.revision.value).toBe(2);
    expect(changelog.appended.map((entry) => entry.change.revision.value)).toEqual([1, 2]);
    expect(changelog.appended.map((entry) => entry.change.op)).toEqual(['upsert', 'delete']);
  });
});
