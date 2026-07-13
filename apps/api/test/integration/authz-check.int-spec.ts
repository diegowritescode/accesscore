import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { NamespaceConfigWriter } from '../../src/authz/application/namespace-config-writer';
import { PdpService } from '../../src/authz/application/pdp-service';
import { RelationTupleWriter } from '../../src/authz/application/relation-tuple-writer';
import { Action } from '../../src/authz/domain/action';
import {
  type ConsistencyRequirement,
  type Principal,
  type RequestContext,
} from '../../src/authz/domain/authorization-request';
import { ConsistencyToken } from '../../src/authz/domain/consistency-token';
import { type EntityRef } from '../../src/authz/domain/entity-ref';
import { type NamespaceConfigData } from '../../src/authz/domain/namespace-config';
import { DrizzleDecisionLog } from '../../src/authz/infrastructure/persistence/drizzle-decision-log';
import { DrizzleNamespaceDefinitionsRepository } from '../../src/authz/infrastructure/persistence/drizzle-namespace-definitions.repository';
import { DrizzleRelationTupleStore } from '../../src/authz/infrastructure/persistence/drizzle-relation-tuple.store';
import { DrizzleRevisionsRepository } from '../../src/db/drizzle-revisions.repository';
import { DrizzleUnitOfWork } from '../../src/db/drizzle-unit-of-work';
import { OrgId } from '../../src/shared/kernel/org-id';
import { Revision } from '../../src/shared/kernel/revision';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const now = new Date('2026-07-12T00:00:00.000Z');
const clock = { now: () => now };

const config: NamespaceConfigData = {
  relations: ['owner', 'editor', 'viewer'],
  actions: { read: ['viewer', 'editor', 'owner'] },
};

describe('authz check orchestration (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  const tuples = new DrizzleRelationTupleStore(db);
  const namespaces = new DrizzleNamespaceDefinitionsRepository(db);
  const revisions = new DrizzleRevisionsRepository();
  const uow = new DrizzleUnitOfWork(db);
  const tupleWriter = new RelationTupleWriter(tuples, revisions, uow, clock);
  const configWriter = new NamespaceConfigWriter(namespaces, revisions, uow, clock);
  const pdp = new PdpService(namespaces, tuples, revisions, new DrizzleDecisionLog(db), uow, clock);

  const orgA = OrgId.generate();
  const orgB = OrgId.generate();
  const resource: EntityRef = { type: 'document', id: 'doc-1' };

  const insertOrg = async (id: string, slug: string): Promise<void> => {
    await pool.query(
      'INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
      [id, 'Org', slug, now, now],
    );
  };

  const principal = (org: OrgId, subjectId: string): Principal => ({
    subject: { type: 'user', id: subjectId },
    orgId: org.value,
    assuranceLevel: 1,
    sessionId: 'sid-1',
  });

  const context = (consistency: ConsistencyRequirement): RequestContext => ({
    ip: '203.0.113.1',
    requestId: 'req-1',
    requestedAt: now,
    consistency,
  });

  const logCount = async (): Promise<number> => {
    const result = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM decision_log');
    return result.rows[0]?.n ?? -1;
  };

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE decision_log, relation_tuples, namespace_definitions, organizations, revisions RESTART IDENTITY CASCADE',
    );
    await insertOrg(orgA.value, `a-${orgA.value}`);
    await insertOrg(orgB.value, `b-${orgB.value}`);
    const defined = await configWriter.define({ orgId: orgA, namespace: 'document', config });
    if (!defined.ok) {
      throw new Error(`seed config failed: ${defined.error}`);
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('reflects a write checked with a zookie >= its revision (read-after-write) and logs it', async () => {
    const written = await tupleWriter.write({
      orgId: orgA,
      object: resource,
      relation: 'viewer',
      subject: { kind: 'subject', ref: { type: 'user', id: 'alice' } },
    });

    const decision = await pdp.check(
      principal(orgA, 'alice'),
      Action.of('document.read'),
      resource,
      context({ mode: 'at-least', token: written.encode() }),
    );

    expect(decision.effect).toBe('permit');

    const rows = await pool.query<{
      effect: string;
      subject: string;
      action: string;
      resource: string;
      revision_used: string;
    }>('SELECT effect, subject, action, resource, revision_used FROM decision_log');
    expect(rows.rows).toHaveLength(1);
    const row = rows.rows[0];
    expect(row?.effect).toBe('permit');
    expect(row?.subject).toBe('user:alice');
    expect(row?.action).toBe('document.read');
    expect(row?.resource).toBe('document:doc-1');
    expect(Number(row?.revision_used)).toBeGreaterThanOrEqual(written.revision.value);
  });

  it('denies and logs when no relationship grants the action', async () => {
    const decision = await pdp.check(
      principal(orgA, 'bob'),
      Action.of('document.read'),
      resource,
      context({ mode: 'full' }),
    );

    expect(decision.effect).toBe('deny');
    expect(await logCount()).toBe(1);
  });

  it('does not resolve across org boundaries', async () => {
    await tupleWriter.write({
      orgId: orgA,
      object: resource,
      relation: 'viewer',
      subject: { kind: 'subject', ref: { type: 'user', id: 'alice' } },
    });

    const decision = await pdp.check(
      principal(orgB, 'alice'),
      Action.of('document.read'),
      resource,
      context({ mode: 'full' }),
    );

    expect(decision.effect).toBe('deny');
  });

  it('fails closed when the consistency token is beyond the store high-water mark', async () => {
    const beyond = ConsistencyToken.fromRevision(Revision.fromValue(9999)).encode();

    const decision = await pdp.check(
      principal(orgA, 'alice'),
      Action.of('document.read'),
      resource,
      context({ mode: 'at-least', token: beyond }),
    );

    expect(decision.effect).toBe('deny');
    expect(decision.reasons[0]?.code).toBe('consistency_unavailable');
  });
});
