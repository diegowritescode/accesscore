import { asc, desc, sql } from 'drizzle-orm';
import { type Database } from '../../db/db.module';
import { type Clock } from '../../shared/kernel/clock';
import { GENESIS_HASH, hashRecord, verifyChain } from '../domain/audit-chain';
import {
  type AppendedRecord,
  type AuditEvent,
  type ChainVerification,
} from '../domain/audit-event';
import { type AuditLog } from '../domain/ports/audit-log';
import { securityAudit } from './persistence/schema';

const LOCK_KEY = 4242424242;

export class DrizzleAuditLog implements AuditLog {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async append(event: AuditEvent): Promise<AppendedRecord> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
      const tail = await tx
        .select({ hash: securityAudit.hash })
        .from(securityAudit)
        .orderBy(desc(securityAudit.seq))
        .limit(1);
      const prevHash = tail[0]?.hash ?? GENESIS_HASH;
      const recordedAt = this.clock.now();
      const hash = hashRecord(prevHash, {
        type: event.type,
        orgId: event.orgId,
        subject: event.subject,
        payload: event.payload,
        recordedAt,
      });
      const rows = await tx
        .insert(securityAudit)
        .values({
          type: event.type,
          orgId: event.orgId,
          subject: event.subject,
          payload: event.payload,
          prevHash,
          hash,
          recordedAt,
        })
        .returning({ seq: securityAudit.seq });
      return { seq: rows[0]?.seq ?? 0, hash };
    });
  }

  async verify(): Promise<ChainVerification> {
    const rows = await this.db.select().from(securityAudit).orderBy(asc(securityAudit.seq));
    return verifyChain(
      rows.map((row) => ({
        type: row.type,
        orgId: row.orgId,
        subject: row.subject,
        payload: row.payload,
        recordedAt: row.recordedAt,
        hash: row.hash,
      })),
    );
  }
}
