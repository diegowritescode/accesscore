import { err, ok, type Result } from '../../shared/result';
import { type Clock } from '../../shared/kernel/clock';
import { type Hasher } from '../domain/ports/hasher';
import { type PasswordResetTokensRepository } from '../domain/ports/password-reset-tokens-repository';
import { type SessionRevoker } from '../domain/ports/session-revoker';
import { type TokenGenerator } from '../domain/ports/token-generator';
import { type UsersRepository } from '../domain/ports/users-repository';
import { Password } from '../domain/value-objects/password';

export interface ResetPasswordCommand {
  token: string;
  password: string;
}

export type ResetPasswordError = 'invalid_password' | 'invalid_token';

export const RESET_PASSWORD_HANDLER = Symbol('RESET_PASSWORD_HANDLER');

export class ResetPasswordHandler {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwordResetTokens: PasswordResetTokensRepository,
    private readonly hasher: Hasher,
    private readonly tokenGenerator: TokenGenerator,
    private readonly sessionRevoker: SessionRevoker,
    private readonly clock: Clock,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<Result<void, ResetPasswordError>> {
    const password = Password.create(command.password);
    if (!password.ok) return err('invalid_password');

    const tokenHash = this.tokenGenerator.hash(command.token);
    const token = await this.passwordResetTokens.findByHash(tokenHash);
    const now = this.clock.now();
    if (!token || token.isConsumed() || token.isExpired(now)) {
      return err('invalid_token');
    }

    const user = await this.users.findById(token.userId);
    if (!user) {
      return err('invalid_token');
    }

    const passwordHash = await this.hasher.hash(password.value);
    user.changePassword(passwordHash, now);
    token.consume(now);
    await this.users.save(user);
    await this.passwordResetTokens.consume(token);
    await this.sessionRevoker.revokeAllForUser(user.id);

    return ok(undefined);
  }
}
