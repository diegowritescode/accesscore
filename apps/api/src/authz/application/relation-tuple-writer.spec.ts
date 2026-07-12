import { OrgId } from '../../shared/kernel/org-id';
import { Revision } from '../../shared/kernel/revision';
import { type RevisionsRepository } from '../../shared/persistence/revisions-repository';
import { type Tx, type UnitOfWork } from '../../shared/persistence/unit-of-work';
import { type EntityRef } from '../domain/entity-ref';
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
}

class RecordingStore implements RelationTupleStore {
  readonly upserts: { tuple: RelationTuple; tx?: Tx }[] = [];
  readonly deletes: { key: RelationTupleKey; tx?: Tx }[] = [];

  upsert(tuple: RelationTuple, tx?: Tx): Promise<void> {
    this.upserts.push({ tuple, tx });
    return Promise.resolve();
  }

  delete(key: RelationTupleKey, tx?: Tx): Promise<number> {
    this.deletes.push({ key, tx });
    return Promise.resolve(1);
  }

  listByObject(_query: ObjectRelationQuery): Promise<RelationTuple[]> {
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
  let writer: RelationTupleWriter;

  beforeEach(() => {
    store = new RecordingStore();
    revisions = new RecordingRevisions();
    uow = new SingleTxUnitOfWork();
    writer = new RelationTupleWriter(store, revisions, uow, { now: () => now });
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
});
