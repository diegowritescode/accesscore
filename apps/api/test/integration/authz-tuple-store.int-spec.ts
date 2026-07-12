import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { RelationTupleWriter } from '../../src/authz/application/relation-tuple-writer';
import { ConsistencyToken } from '../../src/authz/domain/consistency-token';
import { type EntityRef } from '../../src/authz/domain/entity-ref';
import { type SubjectRef } from '../../src/authz/domain/subject-ref';
import { RelationTuple } from '../../src/authz/domain/relation-tuple';
import { DrizzleRelationTupleStore } from '../../src/authz/infrastructure/persistence/drizzle-relation-tuple.store';
import { DrizzleRevisionsRepository } from '../../src/db/drizzle-revisions.repository';
import { DrizzleUnitOfWork } from '../../src/db/drizzle-unit-of-work';
import { OrgId } from '../../src/shared/kernel/org-id';
import { Revision } from '../../src/shared/kernel/revision';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const now = new Date('2026-07-12T00:00:00.000Z');

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('expected a persisted tuple');
  }
  return value;
}

describe('authz relation-tuple store (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  const store = new DrizzleRelationTupleStore(db);
  const writer = new RelationTupleWriter(
    store,
    new DrizzleRevisionsRepository(),
    new DrizzleUnitOfWork(db),
    {
      now: () => now,
    },
  );

  const orgA = OrgId.generate();
  const orgB = OrgId.generate();
  const object: EntityRef = { type: 'document', id: 'doc-1' };
  const relation = 'viewer';
  const alice: SubjectRef = { kind: 'subject', ref: { type: 'user', id: 'alice' } };

  const insertOrg = async (id: string, slug: string): Promise<void> => {
    await pool.query(
      'INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
      [id, 'Org', slug, now, now],
    );
  };

  const rowCount = async (): Promise<number> => {
    const result = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM relation_tuples',
    );
    return result.rows[0]?.n ?? -1;
  };

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE relation_tuples, organizations, revisions RESTART IDENTITY CASCADE',
    );
    await insertOrg(orgA.value, `a-${orgA.value}`);
    await insertOrg(orgB.value, `b-${orgB.value}`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('persists a tuple with a commit-ordered revision and returns a zookie', async () => {
    const token = await writer.write({ orgId: orgA, object, relation, subject: alice });
    const revision = ConsistencyToken.decode(token.encode()).revision.value;

    expect(revision).toBeGreaterThan(0);

    const tuples = await store.listByObject({ orgId: orgA, object, relation });
    expect(tuples).toHaveLength(1);
    const persisted = required(tuples[0]);
    expect(persisted.revision.value).toBe(revision);
    expect(persisted.subject).toEqual(alice);
  });

  it('never resolves tuples across org boundaries', async () => {
    await writer.write({ orgId: orgA, object, relation, subject: alice });
    await writer.write({ orgId: orgB, object, relation, subject: alice });

    const inA = await store.listByObject({ orgId: orgA, object, relation });
    const inB = await store.listByObject({ orgId: orgB, object, relation });

    expect(inA).toHaveLength(1);
    expect(required(inA[0]).orgId.value).toBe(orgA.value);
    expect(inB).toHaveLength(1);
    expect(required(inB[0]).orgId.value).toBe(orgB.value);
    expect(await rowCount()).toBe(2);
  });

  it('round-trips a userset subject through the store', async () => {
    const group: SubjectRef = {
      kind: 'userset',
      ref: { type: 'group', id: 'eng' },
      relation: 'member',
    };
    await writer.write({ orgId: orgA, object, relation, subject: group });

    const tuples = await store.listByObject({ orgId: orgA, object, relation });
    expect(tuples).toHaveLength(1);
    expect(required(tuples[0]).subject).toEqual(group);
  });

  it('is idempotent on re-write and bumps the tuple revision', async () => {
    const first = (await writer.write({ orgId: orgA, object, relation, subject: alice })).revision
      .value;
    const second = (await writer.write({ orgId: orgA, object, relation, subject: alice })).revision
      .value;

    expect(second).toBeGreaterThan(first);
    expect(await rowCount()).toBe(1);

    const tuples = await store.listByObject({ orgId: orgA, object, relation });
    expect(required(tuples[0]).revision.value).toBe(second);
  });

  it('revokes a tuple and advances the revision past the write', async () => {
    const written = (await writer.write({ orgId: orgA, object, relation, subject: alice })).revision
      .value;
    const revoked = (await writer.revoke({ orgId: orgA, object, relation, subject: alice }))
      .revision.value;

    expect(revoked).toBeGreaterThan(written);
    expect(await store.listByObject({ orgId: orgA, object, relation })).toHaveLength(0);
  });

  it('supports direct writes and deletes outside a unit of work', async () => {
    const tuple = RelationTuple.write({
      orgId: orgA,
      object,
      relation,
      subject: alice,
      revision: Revision.fromValue(1),
      createdAt: now,
    });
    await store.upsert(tuple);
    expect(await store.listByObject({ orgId: orgA, object, relation })).toHaveLength(1);

    const deleted = await store.delete({ orgId: orgA, object, relation, subject: alice });
    expect(deleted).toBe(1);
    expect(await store.listByObject({ orgId: orgA, object, relation })).toHaveLength(0);
  });

  it('serializes concurrent writes into distinct revisions', async () => {
    const bob: SubjectRef = { kind: 'subject', ref: { type: 'user', id: 'bob' } };
    const [a, b] = await Promise.all([
      writer.write({ orgId: orgA, object, relation, subject: alice }),
      writer.write({ orgId: orgA, object, relation, subject: bob }),
    ]);

    expect(a.revision.value).not.toBe(b.revision.value);
    expect(await rowCount()).toBe(2);
  });
});
