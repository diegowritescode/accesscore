import { RegisterUserHandler } from './register-user';
import { type Clock } from '../../shared/kernel/clock';
import { type Hasher } from '../domain/ports/hasher';
import { type Mailer } from '../domain/ports/mailer';
import { type TokenGenerator } from '../domain/ports/token-generator';
import { type UsersRepository } from '../domain/ports/users-repository';
import { type VerificationTokensRepository } from '../domain/ports/verification-tokens-repository';
import { User } from '../domain/user';
import { Email } from '../domain/value-objects/email';
import { PasswordHash } from '../domain/value-objects/password-hash';
import { UserId } from '../../shared/kernel/user-id';

const now = new Date('2026-01-01T00:00:00.000Z');

const existingUser = (): User => {
  const email = Email.create('taken@example.com');
  if (!email.ok) throw new Error('invalid fixture email');
  return User.register({
    id: UserId.generate(),
    email: email.value,
    passwordHash: PasswordHash.fromEncoded('$argon2id$hash'),
    now,
  });
};

const buildDeps = () => {
  const users = {
    save: jest.fn(),
    findByEmail: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
  } as unknown as jest.Mocked<UsersRepository>;
  const verificationTokens = {
    save: jest.fn(),
  } as unknown as jest.Mocked<VerificationTokensRepository>;
  const hasher = {
    hash: jest.fn().mockResolvedValue(PasswordHash.fromEncoded('$argon2id$hash')),
    verify: jest.fn(),
    dummyVerify: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Hasher>;
  const tokenGenerator = {
    generate: jest.fn().mockReturnValue({ raw: 'raw-token', hash: 'token-hash' }),
  } as unknown as jest.Mocked<TokenGenerator>;
  const mailer = {
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Mailer>;
  const clock: Clock = { now: () => now };
  return { users, verificationTokens, hasher, tokenGenerator, mailer, clock };
};

const handlerFrom = (deps: ReturnType<typeof buildDeps>): RegisterUserHandler =>
  new RegisterUserHandler(
    deps.users,
    deps.verificationTokens,
    deps.hasher,
    deps.tokenGenerator,
    deps.mailer,
    deps.clock,
  );

describe('RegisterUserHandler', () => {
  it('rejects an invalid email', async () => {
    const deps = buildDeps();
    const result = await handlerFrom(deps).execute({ email: 'nope', password: 'abcdefgh' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_email');
    expect(deps.users.save).not.toHaveBeenCalled();
  });

  it('rejects a weak password', async () => {
    const deps = buildDeps();
    const result = await handlerFrom(deps).execute({
      email: 'user@example.com',
      password: 'short',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_password');
  });

  it('does not create a duplicate and equalizes timing when the email exists', async () => {
    const deps = buildDeps();
    deps.users.findByEmail.mockResolvedValue(existingUser());
    const result = await handlerFrom(deps).execute({
      email: 'taken@example.com',
      password: 'abcdefgh',
    });
    expect(result.ok).toBe(true);
    expect(deps.hasher.dummyVerify).toHaveBeenCalledTimes(1);
    expect(deps.hasher.hash).not.toHaveBeenCalled();
    expect(deps.users.save).not.toHaveBeenCalled();
  });

  it('registers a new user, issues a verification token and notifies', async () => {
    const deps = buildDeps();
    const result = await handlerFrom(deps).execute({
      email: 'new@example.com',
      password: 'abcdefgh',
    });
    expect(result.ok).toBe(true);
    expect(deps.hasher.hash).toHaveBeenCalledTimes(1);
    expect(deps.users.save).toHaveBeenCalledTimes(1);
    const saved = deps.users.save.mock.calls[0]?.[0];
    expect(saved?.status).toBe('pending_verification');
    expect(saved?.email.value).toBe('new@example.com');
    expect(deps.verificationTokens.save).toHaveBeenCalledTimes(1);
    expect(deps.mailer.sendEmailVerification).toHaveBeenCalledTimes(1);
  });
});
