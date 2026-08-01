import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { RelationTupleWriter } from '../../src/authz/application/relation-tuple-writer';
import { type EntityRef } from '../../src/authz/domain/entity-ref';
import { type SubjectRef } from '../../src/authz/domain/subject-ref';
import { DrizzleRelationTupleChangelog } from '../../src/authz/infrastructure/persistence/drizzle-relation-tuple-changelog';
import { DrizzleRelationTupleStore } from '../../src/authz/infrastructure/persistence/drizzle-relation-tuple.store';
import { DrizzleRevisionsRepository } from '../../src/db/drizzle-revisions.repository';
import { DrizzleUnitOfWork } from '../../src/db/drizzle-unit-of-work';
import { OrgId } from '../../src/shared/kernel/org-id';
import { Revision } from '../../src/shared/kernel/revision';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const now = new Date('2026-08-01T00:00:00.000Z');

describe('relation-tuple changelog (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  const store = new DrizzleRelationTupleStore(db);
  const revisions = new DrizzleRevisionsRepository(db);
  const uow = new DrizzleUnitOfWork(db);
  const changelog = new DrizzleRelationTupleChangelog(db);
  const writer = new RelationTupleWriter(store, revisions, uow, { now: () => now }, changelog);

  const orgA = OrgId.generate();
  const orgB = OrgId.generate();
  const doc: EntityRef = { type: 'document', id: 'doc-1' };
  const alice: SubjectRef = { kind: 'subject', ref: { type: 'user', id: 'alice' } };
  const bob: SubjectRef = { kind: 'subject', ref: { type: 'user', id: 'bob' } };
  const engineering: SubjectRef = {
    kind: 'userset',
    ref: { type: 'group', id: 'engineering' },
    relation: 'member',
  };

  const insertOrg = async (id: string, slug: string): Promise<void> => {
    await pool.query(
      'INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
      [id, 'Org', slug, now, now],
    );
  };

  const fromStart = (orgId: OrgId, limit = 100): ReturnType<typeof changelog.since> =>
    changelog.since({ orgId, afterRevision: Revision.fromValue(0), limit });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE relation_tuple_changelog, relation_tuples, organizations, revisions RESTART IDENTITY CASCADE',
    );
    await insertOrg(orgA.value, `a-${orgA.value}`);
    await insertOrg(orgB.value, `b-${orgB.value}`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('records a write as an upsert change at the revision the zookie returns', async () => {
    const token = await writer.write({
      orgId: orgA,
      object: doc,
      relation: 'viewer',
      subject: alice,
    });

    const changes = await fromStart(orgA);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      orgId: expect.objectContaining({ value: orgA.value }),
      revision: expect.objectContaining({ value: token.revision.value }),
      op: 'upsert',
      object: doc,
      relation: 'viewer',
      subject: alice,
      recordedAt: now,
    });
  });

  it('records a revoke as a delete change, so a watcher sees the tombstone the tuple table lost', async () => {
    await writer.write({ orgId: orgA, object: doc, relation: 'viewer', subject: alice });
    await writer.revoke({ orgId: orgA, object: doc, relation: 'viewer', subject: alice });

    expect(await store.listByObject({ orgId: orgA, object: doc, relation: 'viewer' })).toHaveLength(
      0,
    );
    const changes = await fromStart(orgA);
    expect(changes.map((change) => change.op)).toEqual(['upsert', 'delete']);
  });

  it('records nothing for a revoke that matched no tuple, leaving a gap in revision space', async () => {
    const token = await writer.revoke({
      orgId: orgA,
      object: doc,
      relation: 'viewer',
      subject: alice,
    });

    expect(token.revision.value).toBeGreaterThan(0);
    expect(await fromStart(orgA)).toHaveLength(0);
  });

  it('orders changes by revision and resumes strictly after the cursor', async () => {
    const first = await writer.write({
      orgId: orgA,
      object: doc,
      relation: 'viewer',
      subject: alice,
    });
    await writer.write({ orgId: orgA, object: doc, relation: 'viewer', subject: bob });
    await writer.write({ orgId: orgA, object: doc, relation: 'editor', subject: engineering });

    const all = await fromStart(orgA);
    expect(all.map((change) => change.revision.value)).toEqual([1, 2, 3]);

    const resumed = await changelog.since({
      orgId: orgA,
      afterRevision: first.revision,
      limit: 100,
    });
    expect(resumed.map((change) => change.revision.value)).toEqual([2, 3]);
    expect(resumed.at(-1)?.subject).toEqual(engineering);
  });

  it('caps a page at the requested limit so a watcher can drain incrementally', async () => {
    await writer.write({ orgId: orgA, object: doc, relation: 'viewer', subject: alice });
    await writer.write({ orgId: orgA, object: doc, relation: 'viewer', subject: bob });
    await writer.write({ orgId: orgA, object: doc, relation: 'editor', subject: alice });

    const page = await fromStart(orgA, 2);
    expect(page.map((change) => change.revision.value)).toEqual([1, 2]);

    const next = await changelog.since({
      orgId: orgA,
      afterRevision: Revision.fromValue(2),
      limit: 2,
    });
    expect(next.map((change) => change.revision.value)).toEqual([3]);
  });

  it('never leaks another tenant changes', async () => {
    await writer.write({ orgId: orgA, object: doc, relation: 'viewer', subject: alice });
    await writer.write({ orgId: orgB, object: doc, relation: 'viewer', subject: bob });

    const forA = await fromStart(orgA);
    expect(forA).toHaveLength(1);
    expect(forA[0]?.orgId.value).toBe(orgA.value);

    const forB = await fromStart(orgB);
    expect(forB).toHaveLength(1);
    expect(forB[0]?.subject).toEqual(bob);
  });

  it('rolls the changelog entry back with the tuple when the transaction fails', async () => {
    const failing = new DrizzleRelationTupleStore(db);
    jest.spyOn(failing, 'upsert').mockRejectedValue(new Error('tuple write failed'));
    const brokenWriter = new RelationTupleWriter(
      failing,
      revisions,
      uow,
      { now: () => now },
      changelog,
    );

    await expect(
      brokenWriter.write({ orgId: orgA, object: doc, relation: 'viewer', subject: alice }),
    ).rejects.toThrow('tuple write failed');

    expect(await fromStart(orgA)).toHaveLength(0);
    const revisionRows = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM revisions',
    );
    expect(revisionRows.rows[0]?.n).toBe(0);
  });
});
