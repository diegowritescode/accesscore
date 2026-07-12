import { VerifyEmailHandler } from './verify-email';
import { EmailVerificationToken } from '../domain/email-verification-token';
import { type Clock } from '../../shared/kernel/clock';
import { type TokenGenerator } from '../domain/ports/token-generator';
import { type UsersRepository } from '../domain/ports/users-repository';
import { type VerificationTokensRepository } from '../domain/ports/verification-tokens-repository';
import { User } from '../domain/user';
import { Email } from '../domain/value-objects/email';
import { PasswordHash } from '../domain/value-objects/password-hash';
import { UserId } from '../../shared/kernel/user-id';

const now = new Date('2026-01-01T00:00:00.000Z');
const userId = UserId.fromString('11111111-1111-1111-1111-111111111111');

const pendingUser = (): User => {
  const email = Email.create('v@example.com');
  if (!email.ok) throw new Error('invalid fixture email');
  return User.reconstitute({
    id: userId,
    email: email.value,
    passwordHash: PasswordHash.fromEncoded('$argon2id$hash'),
    status: 'pending_verification',
    emailVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
  });
};

const token = (options: { expiresAt: Date; consumedAt: Date | null }): EmailVerificationToken =>
  EmailVerificationToken.reconstitute({
    id: 'token-1',
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
  const verificationTokens = {
    save: jest.fn(),
    findByHash: jest.fn(),
    consume: jest.fn(),
  } as unknown as jest.Mocked<VerificationTokensRepository>;
  const tokenGenerator = {
    generate: jest.fn(),
    hash: jest.fn().mockReturnValue('the-hash'),
  } as unknown as jest.Mocked<TokenGenerator>;
  const clock: Clock = { now: () => now };
  return { users, verificationTokens, tokenGenerator, clock };
};

const handlerFrom = (deps: ReturnType<typeof buildDeps>): VerifyEmailHandler =>
  new VerifyEmailHandler(deps.users, deps.verificationTokens, deps.tokenGenerator, deps.clock);

describe('VerifyEmailHandler', () => {
  it('rejects an unknown token', async () => {
    const deps = buildDeps();
    deps.verificationTokens.findByHash.mockResolvedValue(null);
    const result = await handlerFrom(deps).execute({ token: 'raw' });
    expect(result.ok).toBe(false);
    expect(deps.users.save).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const deps = buildDeps();
    deps.verificationTokens.findByHash.mockResolvedValue(
      token({ expiresAt: new Date(now.getTime() - 1000), consumedAt: null }),
    );
    const result = await handlerFrom(deps).execute({ token: 'raw' });
    expect(result.ok).toBe(false);
    expect(deps.users.save).not.toHaveBeenCalled();
  });

  it('rejects an already-consumed token', async () => {
    const deps = buildDeps();
    deps.verificationTokens.findByHash.mockResolvedValue(
      token({ expiresAt: new Date(now.getTime() + 60_000), consumedAt: now }),
    );
    const result = await handlerFrom(deps).execute({ token: 'raw' });
    expect(result.ok).toBe(false);
  });

  it('activates the user and consumes the token for a valid token', async () => {
    const deps = buildDeps();
    deps.verificationTokens.findByHash.mockResolvedValue(
      token({ expiresAt: new Date(now.getTime() + 60_000), consumedAt: null }),
    );
    deps.users.findById.mockResolvedValue(pendingUser());
    const result = await handlerFrom(deps).execute({ token: 'raw' });
    expect(result.ok).toBe(true);
    const saved = deps.users.save.mock.calls[0]?.[0];
    expect(saved?.status).toBe('active');
    expect(saved?.emailVerifiedAt).not.toBeNull();
    expect(deps.verificationTokens.consume).toHaveBeenCalledTimes(1);
  });
});
