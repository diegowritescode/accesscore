import { randomUUID } from 'node:crypto';
import { ok, type Result } from '../../shared/result';
import { PasswordResetToken } from '../domain/password-reset-token';
import { type Clock } from '../domain/ports/clock';
import { type Mailer } from '../domain/ports/mailer';
import { type PasswordResetTokensRepository } from '../domain/ports/password-reset-tokens-repository';
import { type TokenGenerator } from '../domain/ports/token-generator';
import { type UsersRepository } from '../domain/ports/users-repository';
import { Email } from '../domain/value-objects/email';

export interface RequestPasswordResetCommand {
  email: string;
}

export const PASSWORD_RESET_TTL_MINUTES = 15;

export const REQUEST_PASSWORD_RESET_HANDLER = Symbol('REQUEST_PASSWORD_RESET_HANDLER');

export class RequestPasswordResetHandler {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwordResetTokens: PasswordResetTokensRepository,
    private readonly tokenGenerator: TokenGenerator,
    private readonly mailer: Mailer,
    private readonly clock: Clock,
  ) {}

  async execute(command: RequestPasswordResetCommand): Promise<Result<void, never>> {
    const email = Email.create(command.email);
    if (!email.ok) return ok(undefined);

    const user = await this.users.findByEmail(email.value);
    if (user && user.status === 'active') {
      const now = this.clock.now();
      const generated = this.tokenGenerator.generate();
      const token = PasswordResetToken.issue({
        id: randomUUID(),
        userId: user.id,
        tokenHash: generated.hash,
        now,
        ttlMinutes: PASSWORD_RESET_TTL_MINUTES,
      });
      await this.passwordResetTokens.save(token);
      await this.mailer.sendPasswordReset(email.value, generated.raw);
    }

    return ok(undefined);
  }
}
