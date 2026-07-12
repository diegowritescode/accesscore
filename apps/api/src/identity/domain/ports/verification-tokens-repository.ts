import { type EmailVerificationToken } from '../email-verification-token';

export interface VerificationTokensRepository {
  save(token: EmailVerificationToken): Promise<void>;
  findByHash(tokenHash: string): Promise<EmailVerificationToken | null>;
  consume(token: EmailVerificationToken): Promise<void>;
}

export const VERIFICATION_TOKENS_REPOSITORY = Symbol('VERIFICATION_TOKENS_REPOSITORY');
