import { eq } from 'drizzle-orm';
import { type Database } from '../../../db/db.module';
import { PasswordResetToken } from '../../domain/password-reset-token';
import { type PasswordResetTokensRepository } from '../../domain/ports/password-reset-tokens-repository';
import { UserId } from '../../domain/value-objects/user-id';
import { passwordResetTokens } from './schema';

export class DrizzlePasswordResetTokensRepository implements PasswordResetTokensRepository {
  constructor(private readonly db: Database) {}

  async save(token: PasswordResetToken): Promise<void> {
    await this.db.insert(passwordResetTokens).values({
      id: token.id,
      userId: token.userId.value,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      consumedAt: token.consumedAt,
      createdAt: token.createdAt,
    });
  }

  async findByHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const rows = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async consume(token: PasswordResetToken): Promise<void> {
    await this.db
      .update(passwordResetTokens)
      .set({ consumedAt: token.consumedAt })
      .where(eq(passwordResetTokens.id, token.id));
  }

  private toDomain(row: typeof passwordResetTokens.$inferSelect): PasswordResetToken {
    return PasswordResetToken.reconstitute({
      id: row.id,
      userId: UserId.fromString(row.userId),
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
      createdAt: row.createdAt,
    });
  }
}
