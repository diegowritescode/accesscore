import { ResetPasswordHandler } from './reset-password';
import { PasswordResetToken } from '../domain/password-reset-token';
import { type Clock } from '../../shared/kernel/clock';
import { type Hasher } from '../domain/ports/hasher';
import { type PasswordResetTokensRepository } from '../domain/ports/password-reset-tokens-repository';
import { type SessionRevoker } from '../domain/ports/session-revoker';
import { type TokenGenerator } from '../domain/ports/token-generator';
import { type UsersRepository } from '../domain/ports/users-repository';
import { User } from '../domain/user';
import { Email } from '../domain/value-objects/email';
import { PasswordHash } from '../domain/value-objects/password-hash';
import { UserId } from '../../shared/kernel/user-id';

const now = new Date('2026-01-01T00:00:00.000Z');
const userId = UserId.fromString('11111111-1111-1111-1111-111111111111');

const mkEmail = (value: string): Email => {
  const email = Email.create(value);
  if (!email.ok) throw new Error('invalid fixture email');
  return email.value;
};

const activeUser = (): User =>
  User.reconstitute({
    id: userId,
    email: mkEmail('u@example.com'),
    passwordHash: PasswordHash.fromEncoded('$argon2id$old'),
    status: 'active',
    emailVerifiedAt: now,
    createdAt: now,
    updatedAt: now,
  });

const token = (options: { expiresAt: Date; consumedAt: Date | null }): PasswordResetToken =>
  PasswordResetToken.reconstitute({
    id: 'reset-1',
    userId,
    tokenHash: 'the-hash',
    expiresAt: options.expiresAt,
    consumedAt: options.consumedAt,
    createdAt: now,
  });

const buildDeps = () => {
  const users = {
    save: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<UsersRepository>;
  const passwordResetTokens = {
    save: jest.fn(),
    findByHash: jest.fn(),
    consume: jest.fn(),
  } as unknown as jest.Mocked<PasswordResetTokensRepository>;
  const hasher = {
    hash: jest.fn().mockResolvedValue(PasswordHash.fromEncoded('$argon2id$new')),
    verify: jest.fn(),
    dummyVerify: jest.fn(),
  } as unknown as jest.Mocked<Hasher>;
  const tokenGenerator = {
    generate: jest.fn(),
    hash: jest.fn().mockReturnValue('the-hash'),
  } as unknown as jest.Mocked<TokenGenerator>;
  const sessionRevoker = {
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SessionRevoker>;
  const clock: Clock = { now: () => now };
  return { users, passwordResetTokens, hasher, tokenGenerator, sessionRevoker, clock };
};

const handlerFrom = (deps: ReturnType<typeof buildDeps>): ResetPasswordHandler =>
  new ResetPasswordHandler(
    deps.users,
    deps.passwordResetTokens,
    deps.hasher,
    deps.tokenGenerator,
    deps.sessionRevoker,
    deps.clock,
  );

describe('ResetPasswordHandler', () => {
  it('rejects a weak password before touching tokens', async () => {
    const deps = buildDeps();
    const result = await handlerFrom(deps).execute({ token: 'raw', password: 'short' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_password');
    expect(deps.passwordResetTokens.findByHash).not.toHaveBeenCalled();
  });

  it('rejects an unknown token', async () => {
    const deps = buildDeps();
    deps.passwordResetTokens.findByHash.mockResolvedValue(null);
    const result = await handlerFrom(deps).execute({ token: 'raw', password: 'a-strong-password' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_token');
  });

  it('rejects an expired token', async () => {
    const deps = buildDeps();
    deps.passwordResetTokens.findByHash.mockResolvedValue(
      token({ expiresAt: new Date(now.getTime() - 1000), consumedAt: null }),
    );
    const result = await handlerFrom(deps).execute({ token: 'raw', password: 'a-strong-password' });
    expect(result.ok).toBe(false);
    expect(deps.users.save).not.toHaveBeenCalled();
  });

  it('re-hashes the password, consumes the token and revokes sessions', async () => {
    const deps = buildDeps();
    deps.passwordResetTokens.findByHash.mockResolvedValue(
      token({ expiresAt: new Date(now.getTime() + 60_000), consumedAt: null }),
    );
    deps.users.findById.mockResolvedValue(activeUser());
    const result = await handlerFrom(deps).execute({ token: 'raw', password: 'a-strong-password' });
    expect(result.ok).toBe(true);
    expect(deps.hasher.hash).toHaveBeenCalledTimes(1);
    const saved = deps.users.save.mock.calls[0]?.[0];
    expect(saved?.passwordHash.value).toBe('$argon2id$new');
    expect(deps.passwordResetTokens.consume).toHaveBeenCalledTimes(1);
    expect(deps.sessionRevoker.revokeAllForUser).toHaveBeenCalledTimes(1);
  });
});
