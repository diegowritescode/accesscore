import { eq } from 'drizzle-orm';
import { type Database } from '../../../db/db.module';
import { EmailVerificationToken } from '../../domain/email-verification-token';
import { type VerificationTokensRepository } from '../../domain/ports/verification-tokens-repository';
import { UserId } from '../../../shared/kernel/user-id';
import { emailVerificationTokens } from './schema';

export class DrizzleVerificationTokensRepository implements VerificationTokensRepository {
  constructor(private readonly db: Database) {}

  async save(token: EmailVerificationToken): Promise<void> {
    await this.db.insert(emailVerificationTokens).values({
      id: token.id,
      userId: token.userId.value,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      consumedAt: token.consumedAt,
      createdAt: token.createdAt,
    });
  }

  async findByHash(tokenHash: string): Promise<EmailVerificationToken | null> {
    const rows = await this.db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async consume(token: EmailVerificationToken): Promise<void> {
    await this.db
      .update(emailVerificationTokens)
      .set({ consumedAt: token.consumedAt })
      .where(eq(emailVerificationTokens.id, token.id));
  }

  private toDomain(row: typeof emailVerificationTokens.$inferSelect): EmailVerificationToken {
    return EmailVerificationToken.reconstitute({
      id: row.id,
      userId: UserId.fromString(row.userId),
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
      createdAt: row.createdAt,
    });
  }
}
