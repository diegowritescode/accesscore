import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { MfaCredential } from '../../src/identity/domain/mfa-credential';
import { RecoveryCode } from '../../src/identity/domain/recovery-code';
import { User } from '../../src/identity/domain/user';
import { Email } from '../../src/identity/domain/value-objects/email';
import { PasswordHash } from '../../src/identity/domain/value-objects/password-hash';
import { DrizzleMfaCredentialsRepository } from '../../src/identity/infrastructure/persistence/drizzle-mfa-credentials.repository';
import { DrizzleRecoveryCodesRepository } from '../../src/identity/infrastructure/persistence/drizzle-recovery-codes.repository';
import { DrizzleUsersRepository } from '../../src/identity/infrastructure/persistence/drizzle-users.repository';
import { UserId } from '../../src/shared/kernel/user-id';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://accesscore:accesscore@localhost:5432/accesscore';

const now = new Date('2026-07-19T00:00:00.000Z');

const buildUser = (): User => {
  const address = Email.create(`u-${randomUUID()}@example.com`);
  if (!address.ok) throw new Error('invalid email');
  return User.register({
    id: UserId.generate(),
    email: address.value,
    passwordHash: PasswordHash.fromEncoded('$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaA'),
    now,
  });
};

describe('MFA persistence (integration)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  const users = new DrizzleUsersRepository(db);
  const credentials = new DrizzleMfaCredentialsRepository(db);
  const recovery = new DrizzleRecoveryCodesRepository(db);

  let userId: UserId;

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE mfa_credentials, recovery_codes, users, outbox RESTART IDENTITY CASCADE',
    );
    const user = buildUser();
    await users.save(user);
    userId = user.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  const enroll = (): MfaCredential =>
    MfaCredential.enroll({ id: randomUUID(), userId, secretCiphertext: 'vault:v1:xxx', now });

  it('round-trips a credential through its lifecycle', async () => {
    const credential = enroll();
    await credentials.save(credential);

    expect((await credentials.findById(credential.id))?.status).toBe('pending');
    expect((await credentials.findPendingTotpByUser(userId))?.id).toBe(credential.id);
    expect(await credentials.findActiveTotpByUser(userId)).toBeNull();

    credential.activate(now);
    credential.registerUse(42);
    await credentials.save(credential);

    const active = await credentials.findActiveTotpByUser(userId);
    expect(active?.status).toBe('active');
    expect(active?.lastUsedStep).toBe(42);
    expect(await credentials.findPendingTotpByUser(userId)).toBeNull();
  });

  it('allows at most one active TOTP per user', async () => {
    const first = enroll();
    first.activate(now);
    await credentials.save(first);

    const second = enroll();
    second.activate(now);
    await expect(credentials.save(second)).rejects.toThrow();
  });

  it('replaces recovery codes, finds, consumes and counts them', async () => {
    const batch = ['h1', 'h2', 'h3'].map((hash) =>
      RecoveryCode.issue({ id: randomUUID(), userId, codeHash: hash, now }),
    );
    await recovery.replaceForUser(userId, batch);
    expect(await recovery.countActive(userId)).toBe(3);

    const found = await recovery.findByHash(userId, 'h2');
    expect(found).not.toBeNull();
    expect(await recovery.findByHash(userId, 'missing')).toBeNull();

    if (found) {
      found.consume(now);
      await recovery.consume(found);
    }
    expect(await recovery.countActive(userId)).toBe(2);

    await recovery.replaceForUser(userId, [
      RecoveryCode.issue({ id: randomUUID(), userId, codeHash: 'h4', now }),
    ]);
    expect(await recovery.countActive(userId)).toBe(1);
    expect(await recovery.findByHash(userId, 'h2')).not.toBeNull();
    expect(await recovery.findByHash(userId, 'h1')).toBeNull();
  });
});
