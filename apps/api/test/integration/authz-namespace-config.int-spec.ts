import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { NamespaceConfigWriter } from '../../src/authz/application/namespace-config-writer';
import { Action } from '../../src/authz/domain/action';
import { type NamespaceConfigData } from '../../src/authz/domain/namespace-config';
import { DrizzleNamespaceDefinitionsRepository } from '../../src/authz/infrastructure/persistence/drizzle-namespace-definitions.repository';
import { DrizzleRevisionsRepository } from '../../src/db/drizzle-revisions.repository';
import { DrizzleUnitOfWork } from '../../src/db/drizzle-unit-of-work';
import { OrgId } from '../../src/shared/kernel/org-id';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const now = new Date('2026-07-12T00:00:00.000Z');

const config: NamespaceConfigData = {
  relations: ['owner', 'editor', 'viewer'],
  actions: { read: ['viewer', 'editor', 'owner'], write: ['editor', 'owner'] },
};

describe('authz namespace config (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  const repo = new DrizzleNamespaceDefinitionsRepository(db);
  const writer = new NamespaceConfigWriter(
    repo,
    new DrizzleRevisionsRepository(),
    new DrizzleUnitOfWork(db),
    { now: () => now },
  );

  const orgA = OrgId.generate();
  const orgB = OrgId.generate();

  const insertOrg = async (id: string, slug: string): Promise<void> => {
    await pool.query(
      'INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
      [id, 'Org', slug, now, now],
    );
  };

  const countTable = async (table: string): Promise<number> => {
    const result = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
    return result.rows[0]?.n ?? -1;
  };

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE namespace_definitions, organizations, revisions RESTART IDENTITY CASCADE',
    );
    await insertOrg(orgA.value, `a-${orgA.value}`);
    await insertOrg(orgB.value, `b-${orgB.value}`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('persists a config at a revision and resolves an action to its relations', async () => {
    const result = await writer.define({ orgId: orgA, namespace: 'document', config });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.revision.value).toBeGreaterThan(0);

    const loaded = await repo.findByNamespace(orgA, 'document');
    expect(loaded).not.toBeNull();
    expect(loaded?.requiredRelationsFor(Action.of('document.read'))).toEqual([
      'viewer',
      'editor',
      'owner',
    ]);
    expect(loaded?.revision.value).toBe(result.value.revision.value);
  });

  it('isolates namespace configs across orgs', async () => {
    await writer.define({ orgId: orgA, namespace: 'document', config });
    expect(await repo.findByNamespace(orgB, 'document')).toBeNull();
  });

  it('upserts on redefine and advances the revision', async () => {
    const first = await writer.define({ orgId: orgA, namespace: 'document', config });
    const second = await writer.define({
      orgId: orgA,
      namespace: 'document',
      config: { relations: ['viewer'], actions: { read: ['viewer'] } },
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.value.revision.value).toBeGreaterThan(first.value.revision.value);
    expect(await countTable('namespace_definitions')).toBe(1);

    const loaded = await repo.findByNamespace(orgA, 'document');
    expect(loaded?.config.requiredRelationsForVerb('write')).toEqual([]);
  });

  it('rejects an invalid config at write time and persists nothing', async () => {
    const result = await writer.define({
      orgId: orgA,
      namespace: 'document',
      config: { relations: ['viewer'], actions: { read: ['editor'] } },
    });

    expect(result).toEqual({ ok: false, error: 'unknown_relation' });
    expect(await countTable('namespace_definitions')).toBe(0);
    expect(await countTable('revisions')).toBe(0);
  });

  it('lists every namespace in an org ordered by name, isolated per org', async () => {
    await writer.define({
      orgId: orgA,
      namespace: 'folder',
      config: { relations: ['viewer'], actions: { read: ['viewer'] } },
    });
    await writer.define({ orgId: orgA, namespace: 'document', config });
    await writer.define({ orgId: orgB, namespace: 'secret', config });

    const found = await repo.listByOrg(orgA);

    expect(found.map((definition) => definition.namespace)).toEqual(['document', 'folder']);
    expect(await repo.listByOrg(orgB)).toHaveLength(1);
  });
});
