import { and, desc, eq } from 'drizzle-orm';
import { type Database, type Executor } from '../../../db/db.module';
import { OrgId } from '../../../shared/kernel/org-id';
import { UserId } from '../../../shared/kernel/user-id';
import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type SessionsRepository } from '../../domain/ports/sessions-repository';
import { type Session, type SessionStatus } from '../../domain/session';
import { SessionId } from '../../domain/value-objects/session-id';
import { sessions } from './schema';

export class DrizzleSessionsRepository implements SessionsRepository {
  constructor(private readonly db: Database) {}

  async create(session: Session, tx?: Tx): Promise<void> {
    await this.executor(tx)
      .insert(sessions)
      .values({
        id: session.id.value,
        userId: session.userId.value,
        orgId: session.orgId?.value ?? null,
        aal: session.aal,
        authTime: session.authTime,
        status: session.status,
        deviceLabel: session.deviceLabel,
        userAgent: session.userAgent,
        ip: session.ip,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
      });
  }

  async findById(id: SessionId): Promise<Session | null> {
    const rows = await this.db.select().from(sessions).where(eq(sessions.id, id.value)).limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async listActiveByUser(userId: UserId): Promise<Session[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId.value), eq(sessions.status, 'active')))
      .orderBy(desc(sessions.createdAt));
    return rows.map((row) => this.toDomain(row));
  }

  async touch(id: SessionId, at: Date): Promise<void> {
    await this.db.update(sessions).set({ lastSeenAt: at }).where(eq(sessions.id, id.value));
  }

  async revoke(id: SessionId, at: Date, tx?: Tx): Promise<void> {
    await this.executor(tx)
      .update(sessions)
      .set({ status: 'revoked', revokedAt: at })
      .where(eq(sessions.id, id.value));
  }

  async revokeAllForUser(userId: UserId, at: Date, tx?: Tx): Promise<string[]> {
    const rows = await this.executor(tx)
      .update(sessions)
      .set({ status: 'revoked', revokedAt: at })
      .where(and(eq(sessions.userId, userId.value), eq(sessions.status, 'active')))
      .returning({ id: sessions.id });
    return rows.map((row) => row.id);
  }

  private executor(tx?: Tx): Executor {
    return (tx?.executor as Executor) ?? this.db;
  }

  private toDomain(row: typeof sessions.$inferSelect): Session {
    return {
      id: SessionId.fromString(row.id),
      userId: UserId.fromString(row.userId),
      orgId: row.orgId ? OrgId.fromString(row.orgId) : null,
      aal: row.aal,
      authTime: row.authTime,
      status: row.status as SessionStatus,
      deviceLabel: row.deviceLabel,
      userAgent: row.userAgent,
      ip: row.ip,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }
}
