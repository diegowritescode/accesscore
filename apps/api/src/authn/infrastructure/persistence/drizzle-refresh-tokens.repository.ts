import { eq } from 'drizzle-orm';
import { type Database } from '../../../db/db.module';
import { type RefreshTokensRepository } from '../../domain/ports/refresh-tokens-repository';
import { type RefreshToken, type RefreshTokenStatus } from '../../domain/refresh-token';
import { TokenFamilyId } from '../../domain/value-objects/token-family-id';
import { refreshTokens } from './schema';

export class DrizzleRefreshTokensRepository implements RefreshTokensRepository {
  constructor(private readonly db: Database) {}

  async add(token: RefreshToken): Promise<void> {
    await this.db.insert(refreshTokens).values({
      id: token.id,
      familyId: token.familyId.value,
      tokenHash: token.tokenHash,
      generation: token.generation,
      status: token.status,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      consumedAt: token.consumedAt,
    });
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
