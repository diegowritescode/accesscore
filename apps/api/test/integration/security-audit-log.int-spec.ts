import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DrizzleAuditLog } from '../../src/security/infrastructure/drizzle-audit-log';
import { type AuditEvent } from '../../src/security/domain/audit-event';
import { type Clock } from '../../src/shared/kernel/clock';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const clock: Clock = { now: () => new Date('2026-07-19T00:00:00.000Z') };

const event = (type: string, payload: Record<string, unknown> = {}): AuditEvent => ({
  type,
  orgId: 'org-1',
  subject: 'user:alice',
  payload,
});

describe('DrizzleAuditLog (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  const log = new DrizzleAuditLog(db, clock);

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE security_audit RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('verifies an empty chain', async () => {
    expect(await log.verify()).toEqual({ ok: true, length: 0, brokenAt: null });
  });

  it('appends sequential records and links each to its predecessor', async () => {
    const first = await log.append(event('mfa.activated', { credentialId: 'c1' }));
    const second = await log.append(event('mfa.step_up', { factor: 'totp' }));

    expect(second.seq).toBeGreaterThan(first.seq);
    const [row] = await pool
      .query<{ prev_hash: string }>('SELECT prev_hash FROM security_audit WHERE seq = $1', [
        second.seq,
      ])
      .then((r) => r.rows);
    expect(row?.prev_hash).toBe(first.hash);
    expect(await log.verify()).toEqual({ ok: true, length: 2, brokenAt: null });
  });

  it('keeps the chain intact under concurrent appends', async () => {
    const total = 25;
    await Promise.all(
      Array.from({ length: total }, (_, index) => log.append(event('mfa.step_up', { index }))),
    );
    expect(await log.verify()).toEqual({ ok: true, length: total, brokenAt: null });
  });

  it('detects a tampered payload written directly to the table', async () => {
    await log.append(event('mfa.activated', { credentialId: 'c1' }));
    const target = await log.append(event('mfa.disabled', { credentialId: 'c1' }));
    await log.append(event('mfa.step_up', { factor: 'totp' }));

    await pool.query(
      `UPDATE security_audit SET payload = '{"credentialId":"forged"}' WHERE seq = $1`,
      [target.seq],
    );

    expect(await log.verify()).toEqual({ ok: false, length: 3, brokenAt: 1 });
  });

  it('detects a deleted record as a broken link', async () => {
    await log.append(event('mfa.activated'));
    const removed = await log.append(event('mfa.step_up'));
    await log.append(event('mfa.disabled'));

    await pool.query('DELETE FROM security_audit WHERE seq = $1', [removed.seq]);

    expect(await log.verify()).toEqual({ ok: false, length: 2, brokenAt: 1 });
  });
});
