import { type MfaCredentialsRepository } from '../../../identity/domain/ports/mfa-credentials-repository';
import { type Hasher } from '../../../identity/domain/ports/hasher';
import { type UsersRepository } from '../../../identity/domain/ports/users-repository';
import { MfaCredential } from '../../../identity/domain/mfa-credential';
import { User, type UserStatus } from '../../../identity/domain/user';
import { Email } from '../../../identity/domain/value-objects/email';
import { PasswordHash } from '../../../identity/domain/value-objects/password-hash';
import { UserId } from '../../../shared/kernel/user-id';
import { IdentityCredentials } from './identity-credentials';

const fixed = new Date('2026-07-12T00:00:00.000Z');
const USER_ID = '11111111-1111-1111-1111-111111111111';

const buildUser = (status: UserStatus): User =>
  User.reconstitute({
    id: UserId.fromString(USER_ID),
    email: Email.reconstitute('user@example.com'),
    passwordHash: PasswordHash.fromEncoded('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'),
    status,
    emailVerifiedAt: status === 'active' ? fixed : null,
    createdAt: fixed,
    updatedAt: fixed,
  });

class FakeHasher implements Hasher {
  dummyVerifyCalls = 0;
  verifyResult = true;
  hash(): Promise<PasswordHash> {
    return Promise.resolve(PasswordHash.fromEncoded('x'));
  }
  verify(): Promise<boolean> {
    return Promise.resolve(this.verifyResult);
  }
  dummyVerify(): Promise<void> {
    this.dummyVerifyCalls += 1;
    return Promise.resolve();
  }
}

class FakeUsers implements UsersRepository {
  constructor(private readonly user: User | null) {}
  save(): Promise<void> {
    return Promise.resolve();
  }
  findByEmail(): Promise<User | null> {
    return Promise.resolve(this.user);
  }
  findById(): Promise<User | null> {
    return Promise.resolve(this.user);
  }
}

const mfa = (active: MfaCredential | null = null): MfaCredentialsRepository => ({
  save: () => Promise.resolve(),
  findById: () => Promise.resolve(null),
  findActiveTotpByUser: () => Promise.resolve(active),
  findPendingTotpByUser: () => Promise.resolve(null),
});

const activeFactor = (): MfaCredential => {
  const credential = MfaCredential.enroll({
    id: 'c1',
    userId: UserId.fromString(USER_ID),
    secretCiphertext: 'ct:x',
    now: fixed,
  });
  credential.activate(fixed);
  return credential;
};

describe('IdentityCredentials', () => {
  it('returns the user id, aal and mfaRequired=false for an active user without MFA', async () => {
    const hasher = new FakeHasher();
    const credentials = new IdentityCredentials(new FakeUsers(buildUser('active')), hasher, mfa());

    const check = await credentials.verify('user@example.com', 'correct horse battery');

    expect(check).toEqual({ userId: USER_ID, aal: 1, mfaRequired: false });
    expect(hasher.dummyVerifyCalls).toBe(0);
  });

  it('reports mfaRequired=true when the user has an active factor', async () => {
    const credentials = new IdentityCredentials(
      new FakeUsers(buildUser('active')),
      new FakeHasher(),
      mfa(activeFactor()),
    );

    const check = await credentials.verify('user@example.com', 'correct horse battery');

    expect(check).toEqual({ userId: USER_ID, aal: 1, mfaRequired: true });
  });

  it('rejects a wrong password after a real verify (no early return)', async () => {
    const hasher = new FakeHasher();
    hasher.verifyResult = false;
    const credentials = new IdentityCredentials(new FakeUsers(buildUser('active')), hasher, mfa());

    expect(await credentials.verify('user@example.com', 'wrong')).toBeNull();
  });

  it('rejects a non-active user even with the right password', async () => {
    const credentials = new IdentityCredentials(
      new FakeUsers(buildUser('pending_verification')),
      new FakeHasher(),
      mfa(),
    );

    expect(await credentials.verify('user@example.com', 'correct horse battery')).toBeNull();
  });

  it('burns a dummy verify for an unknown user (anti-enumeration)', async () => {
    const hasher = new FakeHasher();
    const credentials = new IdentityCredentials(new FakeUsers(null), hasher, mfa());

    expect(await credentials.verify('nobody@example.com', 'whatever')).toBeNull();
    expect(hasher.dummyVerifyCalls).toBe(1);
  });

  it('burns a dummy verify for a malformed email (anti-enumeration)', async () => {
    const hasher = new FakeHasher();
    const credentials = new IdentityCredentials(new FakeUsers(buildUser('active')), hasher, mfa());

    expect(await credentials.verify('not-an-email', 'whatever')).toBeNull();
    expect(hasher.dummyVerifyCalls).toBe(1);
  });
});
