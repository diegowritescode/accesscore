import { type PasswordResetToken } from '../password-reset-token';

export interface PasswordResetTokensRepository {
  save(token: PasswordResetToken): Promise<void>;
  findByHash(tokenHash: string): Promise<PasswordResetToken | null>;
  consume(token: PasswordResetToken): Promise<void>;
}

export const PASSWORD_RESET_TOKENS_REPOSITORY = Symbol('PASSWORD_RESET_TOKENS_REPOSITORY');
