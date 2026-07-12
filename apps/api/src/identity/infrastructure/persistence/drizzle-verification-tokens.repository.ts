import { type Database } from '../../../db/db.module';
import { type EmailVerificationToken } from '../../domain/email-verification-token';
import { type VerificationTokensRepository } from '../../domain/ports/verification-tokens-repository';
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
}
