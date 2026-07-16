import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { type Condition } from '../../src/authz/domain/policy/condition';
import { type Policy } from '../../src/authz/domain/policy/policy';
import { DrizzlePoliciesRepository } from '../../src/authz/infrastructure/persistence/drizzle-policies.repository';
import { OrgId } from '../../src/shared/kernel/org-id';
import { Revision } from '../../src/shared/kernel/revision';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const now = new Date('2026-07-12T00:00:00.000Z');

const condition: Condition = {
  kind: 'cmp',
  op: 'ge',
  left: { kind: 'attr', path: 'principal.aal' },
  right: { kind: 'lit', value: 1 },
};

describe('authz policies (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  const repo = new DrizzlePoliciesRepository(db);

  const orgA = OrgId.generate();
  const orgB = OrgId.generate();

  const policy = (orgId: OrgId, id: string): Policy => ({
    id,
    orgId,
    effect: 'permit',
    resourceType: 'document',
    action: 'read',
    condition,
    revision: Revision.fromValue(1),
  });

  const insertOrg = async (id: string, slug: string): Promise<void> => {
    await pool.query(
      'INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
      [id, 'Org', slug, now, now],
    );
  };

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE policies, organizations, revisions RESTART IDENTITY CASCADE');
    await insertOrg(orgA.value, `a-${orgA.value}`);
    await insertOrg(orgB.value, `b-${orgB.value}`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('round-trips a policy and lists it by target', async () => {
    await repo.upsert(policy(orgA, 'p1'));

    const found = await repo.listByTarget(orgA, 'document', 'read');
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe('p1');
    expect(found[0]?.orgId.value).toBe(orgA.value);
    expect(found[0]?.effect).toBe('permit');
    expect(found[0]?.condition).toEqual(condition);
    expect(found[0]?.revision.value).toBe(1);
  });

  it('isolates policies across orgs', async () => {
    await repo.upsert(policy(orgA, 'p1'));
    expect(await repo.listByTarget(orgB, 'document', 'read')).toEqual([]);
  });

  it('upserts on conflict by id and overwrites the mutable fields', async () => {
    await repo.upsert(policy(orgA, 'p1'));
    await repo.upsert({ ...policy(orgA, 'p1'), effect: 'forbid', revision: Revision.fromValue(2) });

    const found = await repo.listByTarget(orgA, 'document', 'read');
    expect(found).toHaveLength(1);
    expect(found[0]?.effect).toBe('forbid');
    expect(found[0]?.revision.value).toBe(2);
  });

  it('deletes a policy by id and reports whether a row was removed', async () => {
    await repo.upsert(policy(orgA, 'p1'));

    expect(await repo.deleteById(orgA, 'p1')).toBe(true);
    expect(await repo.deleteById(orgA, 'p1')).toBe(false);
    expect(await repo.listByTarget(orgA, 'document', 'read')).toEqual([]);
  });

  it('lists every policy in an org ordered by target, isolated per org', async () => {
    await repo.upsert({ ...policy(orgA, 'p2'), resourceType: 'folder' });
    await repo.upsert(policy(orgA, 'p1'));
    await repo.upsert(policy(orgB, 'other'));

    const found = await repo.listByOrg(orgA);

    expect(found.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(await repo.listByOrg(orgB)).toHaveLength(1);
  });
});
