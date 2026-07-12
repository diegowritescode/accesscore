import { err, ok, type Result } from '../../shared/result';
import { type Clock } from '../domain/ports/clock';
import { type TokenGenerator } from '../domain/ports/token-generator';
import { type UsersRepository } from '../domain/ports/users-repository';
import { type VerificationTokensRepository } from '../domain/ports/verification-tokens-repository';

export interface VerifyEmailCommand {
  token: string;
}

export type VerifyEmailError = 'invalid_token';

export const VERIFY_EMAIL_HANDLER = Symbol('VERIFY_EMAIL_HANDLER');

export class VerifyEmailHandler {
  constructor(
    private readonly users: UsersRepository,
    private readonly verificationTokens: VerificationTokensRepository,
    private readonly tokenGenerator: TokenGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: VerifyEmailCommand): Promise<Result<void, VerifyEmailError>> {
    const tokenHash = this.tokenGenerator.hash(command.token);
    const token = await this.verificationTokens.findByHash(tokenHash);
    const now = this.clock.now();

    if (!token || token.isConsumed() || token.isExpired(now)) {
      return err('invalid_token');
    }

    const user = await this.users.findById(token.userId);
    if (!user) {
      return err('invalid_token');
    }

    user.verifyEmail(now);
    token.consume(now);
    await this.users.save(user);
    await this.verificationTokens.consume(token);

    return ok(undefined);
  }
}
