import { and, eq } from 'drizzle-orm';
import { type Database } from '../../../db/db.module';
import { type RefreshTokensRepository } from '../../domain/ports/refresh-tokens-repository';
import { type RefreshToken, type RefreshTokenStatus } from '../../domain/refresh-token';
import { TokenFamilyId } from '../../domain/value-objects/token-family-id';
import { refreshTokens } from './schema';

export class DrizzleRefreshTokensRepository implements RefreshTokensRepository {
  constructor(private readonly db: Database) {}

  async add(token: RefreshToken): Promise<void> {
    await this.db.insert(refreshTokens).values(this.toRow(token));
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const rows = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findActiveByFamily(familyId: TokenFamilyId): Promise<RefreshToken | null> {
    const rows = await this.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.familyId, familyId.value), eq(refreshTokens.status, 'active')))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async rotate(presentedId: string, successor: RefreshToken, at: Date): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rotated = await tx
        .update(refreshTokens)
        .set({ status: 'rotated', consumedAt: at })
        .where(and(eq(refreshTokens.id, presentedId), eq(refreshTokens.status, 'active')))
        .returning({ id: refreshTokens.id });
      if (rotated.length === 0) {
        return false;
      }
      await tx.insert(refreshTokens).values(this.toRow(successor));
      return true;
    });
  }

  private toRow(token: RefreshToken): typeof refreshTokens.$inferInsert {
    return {
      id: token.id,
      familyId: token.familyId.value,
      tokenHash: token.tokenHash,
      generation: token.generation,
      status: token.status,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      consumedAt: token.consumedAt,
    };
  }

  private toDomain(row: typeof refreshTokens.$inferSelect): RefreshToken {
    return {
      id: row.id,
      familyId: TokenFamilyId.fromString(row.familyId),
      tokenHash: row.tokenHash,
      generation: row.generation,
      status: row.status as RefreshTokenStatus,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
    };
  }
}
