import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { type DecisionLogRecord } from '../../src/authz/domain/ports/decision-log';
import {
  BufferedDecisionLog,
  ImmediateDecisionLog,
} from '../../src/authz/infrastructure/persistence/buffered-decision-log';
import { DrizzleDecisionLog } from '../../src/authz/infrastructure/persistence/drizzle-decision-log';
import { MetricsService } from '../../src/observability/metrics.service';
import { OrgId } from '../../src/shared/kernel/org-id';
import { Revision } from '../../src/shared/kernel/revision';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const now = new Date('2026-07-30T00:00:00.000Z');
const clock = { now: () => now };

interface LoggedRow {
  id: string;
  org_id: string | null;
  subject: string;
  action: string;
  effect: string;
  reasons: { code: string; message: string }[];
  revision_used: string;
  latency_ms: number;
  created_at: Date;
}

describe('decision log persistence (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  const orgId = OrgId.generate();

  const entry = (id: string, overrides: Partial<DecisionLogRecord> = {}): DecisionLogRecord => ({
    id,
    orgId,
    subject: 'user:alice',
    action: 'document.read',
    resource: 'document:onboarding',
    effect: 'permit',
    reasons: [{ code: 'grant.direct', message: 'viewer' }],
    revisionUsed: Revision.fromValue(7),
    latencyMs: 3,
    createdAt: now,
    ...overrides,
  });

  const rows = async (): Promise<LoggedRow[]> =>
    (
      await pool.query<LoggedRow>(
        'SELECT id, org_id, subject, action, effect, reasons, revision_used, latency_ms, created_at FROM decision_log ORDER BY created_at, id',
      )
    ).rows;

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE decision_log RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('inserts a whole buffered batch in a single multi-row statement', async () => {
    const sink = new DrizzleDecisionLog(db);
    const recordBatch = jest.spyOn(sink, 'recordBatch');
    const log = new BufferedDecisionLog(sink, new MetricsService(), clock, {
      maxBufferSize: 1000,
      flushBatchSize: 500,
      flushIntervalMs: 3_600_000,
    });

    await log.record(entry('11111111-1111-1111-1111-111111111111'));
    await log.record(entry('22222222-2222-2222-2222-222222222222'));
    await log.record(entry('33333333-3333-3333-3333-333333333333'));
    expect(await rows()).toHaveLength(0);

    await log.close();

    expect(recordBatch).toHaveBeenCalledTimes(1);
    expect(recordBatch.mock.calls[0]?.[0]).toHaveLength(3);
    expect(await rows()).toHaveLength(3);
  });

  it('round-trips every logged field through the batch insert', async () => {
    const log = new ImmediateDecisionLog(new DrizzleDecisionLog(db));

    await log.record(
      entry('44444444-4444-4444-4444-444444444444', {
        effect: 'deny',
        reasons: [{ code: 'default_deny', message: 'no grant found' }],
        revisionUsed: Revision.fromValue(42),
        latencyMs: 17,
      }),
    );

    const [row] = await rows();
    expect(row).toMatchObject({
      id: '44444444-4444-4444-4444-444444444444',
      org_id: orgId.value,
      subject: 'user:alice',
      action: 'document.read',
      effect: 'deny',
      reasons: [{ code: 'default_deny', message: 'no grant found' }],
      latency_ms: 17,
    });
    expect(Number(row?.revision_used)).toBe(42);
    expect(row?.created_at.toISOString()).toBe(now.toISOString());
  });

  it('preserves decision-time ordering across an interleaved degraded write', async () => {
    const sink = new DrizzleDecisionLog(db);
    const log = new BufferedDecisionLog(sink, new MetricsService(), clock, {
      maxBufferSize: 1,
      flushBatchSize: 500,
      flushIntervalMs: 3_600_000,
    });

    const first = new Date(now.getTime());
    const second = new Date(now.getTime() + 1_000);
    await log.record(entry('55555555-5555-5555-5555-555555555555', { createdAt: first }));
    await log.record(entry('66666666-6666-6666-6666-666666666666', { createdAt: second }));

    expect(await rows()).toHaveLength(1);

    await log.close();

    expect((await rows()).map((row) => row.id)).toEqual([
      '55555555-5555-5555-5555-555555555555',
      '66666666-6666-6666-6666-666666666666',
    ]);
  });

  it('writes nothing for an empty batch', async () => {
    await new DrizzleDecisionLog(db).recordBatch([]);
    expect(await rows()).toHaveLength(0);
  });
});
