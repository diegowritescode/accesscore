import { randomUUID } from 'node:crypto';
import { err, ok, type Result } from '../../shared/result';
import { EmailVerificationToken } from '../domain/email-verification-token';
import { type Clock } from '../../shared/kernel/clock';
import { type Hasher } from '../domain/ports/hasher';
import { type Mailer } from '../domain/ports/mailer';
import { type TokenGenerator } from '../domain/ports/token-generator';
import { type UsersRepository } from '../domain/ports/users-repository';
import { type VerificationTokensRepository } from '../domain/ports/verification-tokens-repository';
import { User } from '../domain/user';
import { Email } from '../domain/value-objects/email';
import { Password } from '../domain/value-objects/password';
import { UserId } from '../../shared/kernel/user-id';

export interface RegisterUserCommand {
  email: string;
  password: string;
}

export type RegisterUserError = 'invalid_email' | 'invalid_password';

export const VERIFICATION_TOKEN_TTL_MINUTES = 60;

export const REGISTER_USER_HANDLER = Symbol('REGISTER_USER_HANDLER');

export class RegisterUserHandler {
  constructor(
    private readonly users: UsersRepository,
    private readonly verificationTokens: VerificationTokensRepository,
    private readonly hasher: Hasher,
    private readonly tokenGenerator: TokenGenerator,
    private readonly mailer: Mailer,
    private readonly clock: Clock,
  ) {}

  async execute(command: RegisterUserCommand): Promise<Result<void, RegisterUserError>> {
    const email = Email.create(command.email);
    if (!email.ok) return err('invalid_email');

    const password = Password.create(command.password);
    if (!password.ok) return err('invalid_password');

    const existing = await this.users.findByEmail(email.value);
    if (existing) {
      await this.hasher.dummyVerify(password.value);
      return ok(undefined);
    }

    const passwordHash = await this.hasher.hash(password.value);
    const now = this.clock.now();
    const user = User.register({
      id: UserId.generate(),
      email: email.value,
      passwordHash,
      now,
    });
    await this.users.save(user);

    const generated = this.tokenGenerator.generate();
    const token = EmailVerificationToken.issue({
      id: randomUUID(),
      userId: user.id,
      tokenHash: generated.hash,
      now,
      ttlMinutes: VERIFICATION_TOKEN_TTL_MINUTES,
    });
    await this.verificationTokens.save(token);
    await this.mailer.sendEmailVerification(email.value, generated.raw);

    return ok(undefined);
  }
}
