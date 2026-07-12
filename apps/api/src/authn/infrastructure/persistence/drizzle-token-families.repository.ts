import { eq } from 'drizzle-orm';
import { type Database } from '../../../db/db.module';
import { UserId } from '../../../identity/domain/value-objects/user-id';
import { type TokenFamiliesRepository } from '../../domain/ports/token-families-repository';
import { type TokenFamily, type TokenFamilyStatus } from '../../domain/token-family';
import { SessionId } from '../../domain/value-objects/session-id';
import { TokenFamilyId } from '../../domain/value-objects/token-family-id';
import { tokenFamilies } from './schema';

export class DrizzleTokenFamiliesRepository implements TokenFamiliesRepository {
  constructor(private readonly db: Database) {}

  async create(family: TokenFamily): Promise<void> {
    await this.db.insert(tokenFamilies).values({
      id: family.id.value,
      userId: family.userId.value,
      sessionId: family.sessionId.value,
      status: family.status,
      createdAt: family.createdAt,
      revokedAt: family.revokedAt,
      revokedReason: family.revokedReason,
    });
  }

  async findById(id: TokenFamilyId): Promise<TokenFamily | null> {
    const rows = await this.db
      .select()
      .from(tokenFamilies)
      .where(eq(tokenFamilies.id, id.value))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async revoke(id: TokenFamilyId, reason: string, at: Date): Promise<void> {
    await this.db
      .update(tokenFamilies)
      .set({ status: 'revoked', revokedAt: at, revokedReason: reason })
      .where(eq(tokenFamilies.id, id.value));
  }

  private toDomain(row: typeof tokenFamilies.$inferSelect): TokenFamily {
    return {
      id: TokenFamilyId.fromString(row.id),
      userId: UserId.fromString(row.userId),
      sessionId: SessionId.fromString(row.sessionId),
      status: row.status as TokenFamilyStatus,
      createdAt: row.createdAt,
      revokedAt: row.revokedAt,
      revokedReason: row.revokedReason,
    };
  }
}
