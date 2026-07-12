import { and, desc, eq } from 'drizzle-orm';
import { type Database } from '../../../db/db.module';
import { UserId } from '../../../identity/domain/value-objects/user-id';
import { type SessionsRepository } from '../../domain/ports/sessions-repository';
import { type Session, type SessionStatus } from '../../domain/session';
import { SessionId } from '../../domain/value-objects/session-id';
import { sessions } from './schema';

export class DrizzleSessionsRepository implements SessionsRepository {
  constructor(private readonly db: Database) {}

  async create(session: Session): Promise<void> {
    await this.db.insert(sessions).values({
      id: session.id.value,
      userId: session.userId.value,
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

  async revoke(id: SessionId, at: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ status: 'revoked', revokedAt: at })
      .where(eq(sessions.id, id.value));
  }

  async revokeAllForUser(userId: UserId, at: Date): Promise<string[]> {
    const rows = await this.db
      .update(sessions)
      .set({ status: 'revoked', revokedAt: at })
      .where(and(eq(sessions.userId, userId.value), eq(sessions.status, 'active')))
      .returning({ id: sessions.id });
    return rows.map((row) => row.id);
  }

  private toDomain(row: typeof sessions.$inferSelect): Session {
    return {
      id: SessionId.fromString(row.id),
      userId: UserId.fromString(row.userId),
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
