import { RequestPasswordResetHandler } from './request-password-reset';
import { type Clock } from '../../shared/kernel/clock';
import { type Mailer } from '../domain/ports/mailer';
import { type PasswordResetTokensRepository } from '../domain/ports/password-reset-tokens-repository';
import { type TokenGenerator } from '../domain/ports/token-generator';
import { type UsersRepository } from '../domain/ports/users-repository';
import { User, type UserStatus } from '../domain/user';
import { Email } from '../domain/value-objects/email';
import { PasswordHash } from '../domain/value-objects/password-hash';
import { UserId } from '../../shared/kernel/user-id';

const now = new Date('2026-01-01T00:00:00.000Z');

const mkEmail = (value: string): Email => {
  const email = Email.create(value);
  if (!email.ok) throw new Error('invalid fixture email');
  return email.value;
};

const userWith = (status: UserStatus): User =>
  User.reconstitute({
    id: UserId.generate(),
    email: mkEmail('u@example.com'),
    passwordHash: PasswordHash.fromEncoded('$argon2id$hash'),
    status,
    emailVerifiedAt: status === 'active' ? now : null,
    createdAt: now,
    updatedAt: now,
  });

const buildDeps = () => {
  const users = {
    save: jest.fn(),
    findByEmail: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
  } as unknown as jest.Mocked<UsersRepository>;
  const passwordResetTokens = {
    save: jest.fn(),
    findByHash: jest.fn(),
    consume: jest.fn(),
  } as unknown as jest.Mocked<PasswordResetTokensRepository>;
  const tokenGenerator = {
    generate: jest.fn().mockReturnValue({ raw: 'raw', hash: 'hash' }),
    hash: jest.fn(),
  } as unknown as jest.Mocked<TokenGenerator>;
  const mailer = {
    sendEmailVerification: jest.fn(),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Mailer>;
  const clock: Clock = { now: () => now };
  return { users, passwordResetTokens, tokenGenerator, mailer, clock };
};

const handlerFrom = (deps: ReturnType<typeof buildDeps>): RequestPasswordResetHandler =>
  new RequestPasswordResetHandler(
    deps.users,
    deps.passwordResetTokens,
    deps.tokenGenerator,
    deps.mailer,
    deps.clock,
  );

describe('RequestPasswordResetHandler', () => {
  it('issues a token and emails an active user', async () => {
    const deps = buildDeps();
    deps.users.findByEmail.mockResolvedValue(userWith('active'));
    const result = await handlerFrom(deps).execute({ email: 'u@example.com' });
    expect(result.ok).toBe(true);
    expect(deps.passwordResetTokens.save).toHaveBeenCalledTimes(1);
    expect(deps.mailer.sendPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('does nothing (but still succeeds) for an unknown email', async () => {
    const deps = buildDeps();
    deps.users.findByEmail.mockResolvedValue(null);
    const result = await handlerFrom(deps).execute({ email: 'ghost@example.com' });
    expect(result.ok).toBe(true);
    expect(deps.passwordResetTokens.save).not.toHaveBeenCalled();
    expect(deps.mailer.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('does nothing for a non-active user', async () => {
    const deps = buildDeps();
    deps.users.findByEmail.mockResolvedValue(userWith('pending_verification'));
    const result = await handlerFrom(deps).execute({ email: 'u@example.com' });
    expect(result.ok).toBe(true);
    expect(deps.passwordResetTokens.save).not.toHaveBeenCalled();
  });

  it('does nothing for a malformed email without querying', async () => {
    const deps = buildDeps();
    const result = await handlerFrom(deps).execute({ email: 'not-an-email' });
    expect(result.ok).toBe(true);
    expect(deps.users.findByEmail).not.toHaveBeenCalled();
  });
});
