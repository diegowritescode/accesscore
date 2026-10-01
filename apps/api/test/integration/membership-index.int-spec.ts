import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { MembershipIndexer } from '../../src/authz/application/membership-indexer';
import { NamespaceConfigWriter } from '../../src/authz/application/namespace-config-writer';
import { PdpService } from '../../src/authz/application/pdp-service';
import { RelationTupleWriter } from '../../src/authz/application/relation-tuple-writer';
import { Action } from '../../src/authz/domain/action';
import { type Principal, type RequestContext } from '../../src/authz/domain/authorization-request';
import { type NamespaceConfigData } from '../../src/authz/domain/namespace-config';
import { type SubjectRef } from '../../src/authz/domain/subject-ref';
import { NoopDecisionCache } from '../../src/authz/infrastructure/cache/redis-decision-cache';
import { ImmediateDecisionLog } from '../../src/authz/infrastructure/persistence/buffered-decision-log';
import { DrizzleDecisionLog } from '../../src/authz/infrastructure/persistence/drizzle-decision-log';
import { DrizzleMembershipIndexStore } from '../../src/authz/infrastructure/persistence/drizzle-membership-index';
import { DrizzleRelationTupleChangelog } from '../../src/authz/infrastructure/persistence/drizzle-relation-tuple-changelog';
import { DrizzleNamespaceDefinitionsRepository } from '../../src/authz/infrastructure/persistence/drizzle-namespace-definitions.repository';
import { DrizzlePoliciesRepository } from '../../src/authz/infrastructure/persistence/drizzle-policies.repository';
import { DrizzleRelationTupleStore } from '../../src/authz/infrastructure/persistence/drizzle-relation-tuple.store';
import { DrizzleRevisionsRepository } from '../../src/db/drizzle-revisions.repository';
import { DrizzleUnitOfWork } from '../../src/db/drizzle-unit-of-work';
import { OrgId } from '../../src/shared/kernel/org-id';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const now = new Date('2026-08-01T00:00:00.000Z');
const clock = { now: () => now };

const groupConfig: NamespaceConfigData = {
  relations: ['member'],
  actions: { read: ['member'] },
};

const documentConfig: NamespaceConfigData = {
  relations: ['viewer'],
  actions: { read: ['viewer'] },
};

const user = (id: string): SubjectRef => ({ kind: 'subject', ref: { type: 'user', id } });
const members = (id: string): SubjectRef => ({
  kind: 'userset',
  ref: { type: 'group', id },
  relation: 'member',
});

describe('flattened membership index (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  const tuples = new DrizzleRelationTupleStore(db);
  const namespaces = new DrizzleNamespaceDefinitionsRepository(db);
  const revisions = new DrizzleRevisionsRepository(db);
  const uow = new DrizzleUnitOfWork(db);
  const changelog = new DrizzleRelationTupleChangelog(db);
  const index = new DrizzleMembershipIndexStore(db);
  const writer = new RelationTupleWriter(tuples, revisions, uow, clock, changelog);
  const configWriter = new NamespaceConfigWriter(namespaces, revisions, uow, clock);
  const indexer = new MembershipIndexer(changelog, index, tuples, namespaces, revisions, uow, {
    changePageSize: 500,
    maxTuplesPerOrg: 1000,
    intervalMs: 60_000,
  });

  const orgA = OrgId.generate();
  const orgB = OrgId.generate();

  const insertOrg = async (id: string, slug: string): Promise<void> => {
    await pool.query(
      'INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
      [id, 'Org', slug, now, now],
    );
  };

  const flattened = async (
    orgId: OrgId,
  ): Promise<{ set: string; member: string; depth: number }[]> => {
    const rows = await pool.query<{
      set_type: string;
      set_id: string;
      set_relation: string;
      member_type: string;
      member_id: string;
      depth: number;
    }>(
      'SELECT set_type, set_id, set_relation, member_type, member_id, depth FROM flattened_memberships WHERE org_id = $1 ORDER BY set_id, member_id',
      [orgId.value],
    );
    return rows.rows.map((row) => ({
      set: `${row.set_type}:${row.set_id}#${row.set_relation}`,
      member: `${row.member_type}:${row.member_id}`,
      depth: row.depth,
    }));
  };

  const watermarks = async (orgId: OrgId): Promise<{ set: string; revision: number }[]> => {
    const rows = await pool.query<{
      set_type: string;
      set_id: string;
      set_relation: string;
      valid_at_revision: string;
    }>(
      'SELECT set_type, set_id, set_relation, valid_at_revision FROM flattened_membership_sets WHERE org_id = $1 ORDER BY set_id',
      [orgId.value],
    );
    return rows.rows.map((row) => ({
      set: `${row.set_type}:${row.set_id}#${row.set_relation}`,
      revision: Number(row.valid_at_revision),
    }));
  };

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE flattened_memberships, flattened_membership_sets, index_cursors, decision_log, relation_tuple_changelog, relation_tuples, namespace_definitions, organizations, revisions RESTART IDENTITY CASCADE',
    );
    await insertOrg(orgA.value, `a-${orgA.value}`);
    await insertOrg(orgB.value, `b-${orgB.value}`);
    for (const orgId of [orgA, orgB]) {
      const defined = await configWriter.define({ orgId, namespace: 'group', config: groupConfig });
      if (!defined.ok) {
        throw new Error(`seed config failed: ${defined.error}`);
      }
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('indexes nothing while no set is referenced as a userset', async () => {
    const run = await indexer.runOnce();

    expect(run.indexed).toBe(0);
    expect(await flattened(orgA)).toEqual([]);
  });

  it('flattens a referenced userset and stamps it at the revision it caught up to', async () => {
    await writer.write({
      orgId: orgA,
      object: { type: 'group', id: 'eng' },
      relation: 'member',
      subject: user('alice'),
    });
    const zookie = await writer.write({
      orgId: orgA,
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: members('eng'),
    });

    const run = await indexer.runOnce();

    expect(run.indexed).toBe(1);
    expect(await flattened(orgA)).toEqual([
      { set: 'group:eng#member', member: 'user:alice', depth: 0 },
    ]);
    expect(await watermarks(orgA)).toEqual([
      { set: 'group:eng#member', revision: zookie.revision.value },
    ]);
  });

  it('resolves nested groups and records the hop count as depth', async () => {
    await writer.write({
      orgId: orgA,
      object: { type: 'group', id: 'leads' },
      relation: 'member',
      subject: user('bob'),
    });
    await writer.write({
      orgId: orgA,
      object: { type: 'group', id: 'eng' },
      relation: 'member',
      subject: members('leads'),
    });
    await writer.write({
      orgId: orgA,
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: members('eng'),
    });

    await indexer.runOnce();

    expect(await flattened(orgA)).toEqual([
      { set: 'group:eng#member', member: 'user:bob', depth: 1 },
      { set: 'group:leads#member', member: 'user:bob', depth: 0 },
    ]);
  });

  it('re-materializes after a revoke, dropping the member it removed', async () => {
    await writer.write({
      orgId: orgA,
      object: { type: 'group', id: 'eng' },
      relation: 'member',
      subject: user('alice'),
    });
    await writer.write({
      orgId: orgA,
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: members('eng'),
    });
    await indexer.runOnce();
    expect(await flattened(orgA)).toHaveLength(1);

    await writer.revoke({
      orgId: orgA,
      object: { type: 'group', id: 'eng' },
      relation: 'member',
      subject: user('alice'),
    });
    await indexer.runOnce();

    expect(await flattened(orgA)).toEqual([]);
    expect(await watermarks(orgA)).toHaveLength(1);
  });

  it('removes a set that is no longer referenced as a userset', async () => {
    await writer.write({
      orgId: orgA,
      object: { type: 'group', id: 'eng' },
      relation: 'member',
      subject: user('alice'),
    });
    await writer.write({
      orgId: orgA,
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: members('eng'),
    });
    await indexer.runOnce();
    expect(await watermarks(orgA)).toHaveLength(1);

    await writer.revoke({
      orgId: orgA,
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: members('eng'),
    });
    const run = await indexer.runOnce();

    expect(run.removed).toBe(1);
    expect(await watermarks(orgA)).toEqual([]);
    expect(await flattened(orgA)).toEqual([]);
  });

  it('indexes each tenant separately and never mixes their members', async () => {
    for (const [orgId, member] of [
      [orgA, 'alice'],
      [orgB, 'bob'],
    ] as const) {
      await writer.write({
        orgId,
        object: { type: 'group', id: 'eng' },
        relation: 'member',
        subject: user(member),
      });
      await writer.write({
        orgId,
        object: { type: 'document', id: 'doc-1' },
        relation: 'viewer',
        subject: members('eng'),
      });
    }

    await indexer.runOnce();

    expect(await flattened(orgA)).toEqual([
      { set: 'group:eng#member', member: 'user:alice', depth: 0 },
    ]);
    expect(await flattened(orgB)).toEqual([
      { set: 'group:eng#member', member: 'user:bob', depth: 0 },
    ]);
  });

  it('persists its cursor so a second run has nothing left to do', async () => {
    await writer.write({
      orgId: orgA,
      object: { type: 'group', id: 'eng' },
      relation: 'member',
      subject: user('alice'),
    });
    const zookie = await writer.write({
      orgId: orgA,
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: members('eng'),
    });

    const first = await indexer.runOnce();
    const second = await indexer.runOnce();

    expect(first.cursor.value).toBe(zookie.revision.value);
    expect(second.indexed).toBe(0);
    expect(second.cursor.value).toBe(zookie.revision.value);
  });

  it('skips its run while another instance holds the index lock', async () => {
    await writer.write({
      orgId: orgA,
      object: { type: 'group', id: 'eng' },
      relation: 'member',
      subject: user('alice'),
    });
    await writer.write({
      orgId: orgA,
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: members('eng'),
    });

    await uow.withTransaction(async (holder) => {
      expect(await index.tryLock(holder)).toBe(true);

      const blocked = await indexer.runOnce();

      expect(blocked.indexed).toBe(0);
      expect(await flattened(orgA)).toEqual([]);
    });

    const run = await indexer.runOnce();

    expect(run.indexed).toBe(1);
    expect(await flattened(orgA)).toHaveLength(1);
  });

  it('reads back every set a subject belongs to, with its depth and watermark', async () => {
    await writer.write({
      orgId: orgA,
      object: { type: 'group', id: 'leads' },
      relation: 'member',
      subject: user('bob'),
    });
    await writer.write({
      orgId: orgA,
      object: { type: 'group', id: 'eng' },
      relation: 'member',
      subject: members('leads'),
    });
    const zookie = await writer.write({
      orgId: orgA,
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: members('eng'),
    });
    await indexer.runOnce();

    const hits = await uow.withTransaction((tx) =>
      index.membershipsOf(orgA, { type: 'user', id: 'bob' }, tx),
    );

    expect(
      hits
        .map((hit) => ({
          set: `${hit.set.object.id}#${hit.set.relation}`,
          depth: hit.depth,
          validAt: hit.validAtRevision.value,
        }))
        .sort((a, b) => a.set.localeCompare(b.set)),
    ).toEqual([
      { set: 'eng#member', depth: 1, validAt: zookie.revision.value },
      { set: 'leads#member', depth: 0, validAt: zookie.revision.value },
    ]);
  });

  it('never reads another tenant memberships', async () => {
    await writer.write({
      orgId: orgB,
      object: { type: 'group', id: 'eng' },
      relation: 'member',
      subject: user('bob'),
    });
    await writer.write({
      orgId: orgB,
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: members('eng'),
    });
    await indexer.runOnce();

    const read = (orgId: OrgId) =>
      uow.withTransaction((tx) => index.membershipsOf(orgId, { type: 'user', id: 'bob' }, tx));

    expect(await read(orgA)).toEqual([]);
    expect(await read(orgB)).toHaveLength(1);
  });

  it("versions an organization by its own tuple and namespace changes, not another tenant's", async () => {
    const version = (orgId: OrgId) =>
      uow.withTransaction((tx) => index.organizationVersion(orgId, tx));
    const written = await writer.write({
      orgId: orgA,
      object: { type: 'group', id: 'eng' },
      relation: 'member',
      subject: user('alice'),
    });
    expect((await version(orgA)).value).toBe(written.revision.value);

    await writer.write({
      orgId: orgB,
      object: { type: 'group', id: 'eng' },
      relation: 'member',
      subject: user('bob'),
    });
    expect((await version(orgA)).value).toBe(written.revision.value);

    const redefined = await configWriter.define({
      orgId: orgA,
      namespace: 'group',
      config: { relations: ['member', 'admin'], actions: { read: ['member'] } },
    });
    if (!redefined.ok) {
      throw new Error(redefined.error);
    }
    expect((await version(orgA)).value).toBe(redefined.value.revision.value);
  });

  it('re-materializes an organization after a namespace change alone', async () => {
    await writer.write({
      orgId: orgA,
      object: { type: 'group', id: 'eng' },
      relation: 'admin',
      subject: user('carol'),
    });
    await writer.write({
      orgId: orgA,
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: members('eng'),
    });
    await indexer.runOnce();
    expect(await flattened(orgA)).toEqual([]);

    const redefined = await configWriter.define({
      orgId: orgA,
      namespace: 'group',
      config: {
        relations: ['admin', 'member'],
        actions: { read: ['member'] },
        rewrites: {
          member: {
            kind: 'union',
            children: [{ kind: 'this' }, { kind: 'computedUserset', relation: 'admin' }],
          },
        },
      },
    });
    if (!redefined.ok) {
      throw new Error(redefined.error);
    }
    await indexer.runOnce();

    expect(await flattened(orgA)).toEqual([
      { set: 'group:eng#member', member: 'user:carol', depth: 0 },
    ]);
  });

  it('leaves out a set whose closure crosses an exclusion', async () => {
    const defined = await configWriter.define({
      orgId: orgA,
      namespace: 'group',
      config: {
        relations: ['active', 'banned', 'member'],
        actions: { read: ['member'] },
        rewrites: {
          member: {
            kind: 'exclusion',
            base: { kind: 'computedUserset', relation: 'active' },
            subtract: { kind: 'computedUserset', relation: 'banned' },
          },
        },
      },
    });
    if (!defined.ok) {
      throw new Error(defined.error);
    }
    await writer.write({
      orgId: orgA,
      object: { type: 'group', id: 'eng' },
      relation: 'active',
      subject: user('alice'),
    });
    await writer.write({
      orgId: orgA,
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: members('eng'),
    });

    await indexer.runOnce();

    expect(await watermarks(orgA)).toEqual([]);
    expect(await flattened(orgA)).toEqual([]);
  });

  describe('read path', () => {
    const pdp = new PdpService(
      namespaces,
      tuples,
      new DrizzlePoliciesRepository(db),
      revisions,
      new ImmediateDecisionLog(new DrizzleDecisionLog(db)),
      uow,
      clock,
      new NoopDecisionCache(),
      index,
    );
    const read = Action.of('document.read');
    const resource = { type: 'document', id: 'doc-1' };
    const context: RequestContext = {
      ip: '203.0.113.9',
      requestId: 'req-1',
      requestedAt: now,
      consistency: { mode: 'full' },
    };
    const principal = (orgId: OrgId, id: string): Principal => ({
      subject: { type: 'user', id },
      orgId: orgId.value,
      assuranceLevel: 1,
      sessionId: 'sid-1',
    });
    const grantOf = async (orgId: OrgId, id: string): Promise<string | undefined> => {
      const decision = await pdp.check(principal(orgId, id), read, resource, context);
      return decision.effect === 'permit' ? decision.reasons[0]?.code : decision.effect;
    };

    beforeEach(async () => {
      for (const orgId of [orgA, orgB]) {
        const defined = await configWriter.define({
          orgId,
          namespace: 'document',
          config: documentConfig,
        });
        if (!defined.ok) {
          throw new Error(defined.error);
        }
        await writer.write({
          orgId,
          object: { type: 'group', id: 'leads' },
          relation: 'member',
          subject: user('bob'),
        });
        await writer.write({
          orgId,
          object: { type: 'group', id: 'eng' },
          relation: 'member',
          subject: members('leads'),
        });
        await writer.write({
          orgId,
          object: { type: 'document', id: 'doc-1' },
          relation: 'viewer',
          subject: members('eng'),
        });
      }
    });

    it('answers a nested-group check from the index once it has caught up', async () => {
      expect(await grantOf(orgA, 'bob')).toBe('grant.userset');

      await indexer.runOnce();

      expect(await grantOf(orgA, 'bob')).toBe('grant.indexed_userset');
      expect(await grantOf(orgA, 'mallory')).toBe('deny');
    });

    it('falls back to the live walk after a write in the same organization', async () => {
      await indexer.runOnce();

      await writer.revoke({
        orgId: orgA,
        object: { type: 'group', id: 'leads' },
        relation: 'member',
        subject: user('bob'),
      });

      expect(await grantOf(orgA, 'bob')).toBe('deny');
    });

    it("keeps serving from the index across another tenant's writes", async () => {
      await indexer.runOnce();

      await writer.write({
        orgId: orgB,
        object: { type: 'group', id: 'ops' },
        relation: 'member',
        subject: user('carol'),
      });

      expect(await grantOf(orgA, 'bob')).toBe('grant.indexed_userset');
    });
  });

  it('leaves an oversized organization stale rather than flattening it', async () => {
    const bounded = new MembershipIndexer(changelog, index, tuples, namespaces, revisions, uow, {
      changePageSize: 500,
      maxTuplesPerOrg: 1,
      intervalMs: 60_000,
    });
    await writer.write({
      orgId: orgA,
      object: { type: 'group', id: 'eng' },
      relation: 'member',
      subject: user('alice'),
    });
    await writer.write({
      orgId: orgA,
      object: { type: 'document', id: 'doc-1' },
      relation: 'viewer',
      subject: members('eng'),
    });

    const run = await bounded.runOnce();

    expect(run.skippedOrgs).toBe(1);
    expect(run.indexed).toBe(0);
    expect(await flattened(orgA)).toEqual([]);
  });
});
