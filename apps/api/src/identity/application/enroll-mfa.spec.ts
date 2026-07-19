import { type Clock } from '../../shared/kernel/clock';
import { UserId } from '../../shared/kernel/user-id';
import { type MfaCredential } from '../domain/mfa-credential';
import { type MfaCredentialsRepository } from '../domain/ports/mfa-credentials-repository';
import { type SecretEncryptor } from '../domain/ports/secret-encryptor';
import { type UsersRepository } from '../domain/ports/users-repository';
import { User } from '../domain/user';
import { Email } from '../domain/value-objects/email';
import { PasswordHash } from '../domain/value-objects/password-hash';
import { TotpSecret } from '../domain/value-objects/totp-secret';
import { EnrollMfaHandler } from './enroll-mfa';

const now = new Date('2026-07-19T00:00:00.000Z');
const clock: Clock = { now: () => now };
const RFC_SECRET = new Uint8Array(Buffer.from('12345678901234567890'));

const encryptor: SecretEncryptor = {
  encrypt: (plaintext) => Promise.resolve(`ct:${Buffer.from(plaintext).toString('base64')}`),
  decrypt: (ciphertext) =>
    Promise.resolve(new Uint8Array(Buffer.from(ciphertext.slice(3), 'base64'))),
};

class MemoryCredentials implements MfaCredentialsRepository {
  readonly items = new Map<string, MfaCredential>();
  save(credential: MfaCredential): Promise<void> {
    this.items.set(credential.id, credential);
    return Promise.resolve();
  }
  findById(id: string): Promise<MfaCredential | null> {
    return Promise.resolve(this.items.get(id) ?? null);
  }
  findActiveTotpByUser(userId: UserId): Promise<MfaCredential | null> {
    return this.byStatus(userId, 'active');
  }
  findPendingTotpByUser(userId: UserId): Promise<MfaCredential | null> {
    return this.byStatus(userId, 'pending');
  }
  private byStatus(userId: UserId, status: string): Promise<MfaCredential | null> {
    return Promise.resolve(
      [...this.items.values()].find(
        (item) => item.userId.value === userId.value && item.status === status,
      ) ?? null,
    );
  }
}

const buildUser = (): User => {
  const email = Email.create('demo@accesscore.dev');
  if (!email.ok) throw new Error('invalid email');
  return User.register({
    id: UserId.generate(),
    email: email.value,
    passwordHash: PasswordHash.fromEncoded('$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaA'),
    now,
  });
};

const usersWith = (user: User | null): UsersRepository => ({
  save: () => Promise.resolve(),
  findByEmail: () => Promise.resolve(user),
  findById: () => Promise.resolve(user),
});

describe('EnrollMfaHandler', () => {
  it('provisions a pending credential and returns the otpauth URI', async () => {
    const user = buildUser();
    const credentials = new MemoryCredentials();
    const handler = new EnrollMfaHandler(
      usersWith(user),
      credentials,
      encryptor,
      clock,
      'AccessCore',
      () => 'cred-1',
      () => TotpSecret.fromBytes(RFC_SECRET),
    );

    const result = await handler.execute({ userId: user.id });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.otpauthUri).toContain('secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(result.value.otpauthUri).toContain('issuer=AccessCore');
    expect(result.value.otpauthUri).toContain('demo%40accesscore.dev');
    const stored = await credentials.findPendingTotpByUser(user.id);
    expect(stored?.status).toBe('pending');
    expect(stored?.secretCiphertext).toContain('ct:');
  });

  it('supersedes a prior pending enrollment', async () => {
    const user = buildUser();
    const credentials = new MemoryCredentials();
    let id = 0;
    const handler = new EnrollMfaHandler(
      usersWith(user),
      credentials,
      encryptor,
      clock,
      'AccessCore',
      () => `cred-${(id += 1)}`,
      () => TotpSecret.fromBytes(RFC_SECRET),
    );

    await handler.execute({ userId: user.id });
    await handler.execute({ userId: user.id });

    const pending = [...credentials.items.values()].filter((item) => item.status === 'pending');
    const revoked = [...credentials.items.values()].filter((item) => item.status === 'revoked');
    expect(pending).toHaveLength(1);
    expect(revoked).toHaveLength(1);
  });

  it('rejects when the user does not exist', async () => {
    const handler = new EnrollMfaHandler(
      usersWith(null),
      new MemoryCredentials(),
      encryptor,
      clock,
      'AccessCore',
    );

    const result = await handler.execute({ userId: UserId.generate() });

    expect(result).toEqual({ ok: false, error: 'user_not_found' });
  });
});
