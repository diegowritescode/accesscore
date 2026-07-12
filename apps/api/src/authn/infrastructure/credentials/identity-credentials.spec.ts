import { type Hasher } from '../../../identity/domain/ports/hasher';
import { type UsersRepository } from '../../../identity/domain/ports/users-repository';
import { User, type UserStatus } from '../../../identity/domain/user';
import { Email } from '../../../identity/domain/value-objects/email';
import { PasswordHash } from '../../../identity/domain/value-objects/password-hash';
import { UserId } from '../../../identity/domain/value-objects/user-id';
import { IdentityCredentials } from './identity-credentials';

const fixed = new Date('2026-07-12T00:00:00.000Z');

const buildUser = (status: UserStatus): User =>
  User.reconstitute({
    id: UserId.fromString('11111111-1111-1111-1111-111111111111'),
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

describe('IdentityCredentials', () => {
  it('returns the user id and aal for an active user with the right password', async () => {
    const hasher = new FakeHasher();
    const credentials = new IdentityCredentials(new FakeUsers(buildUser('active')), hasher);

    const check = await credentials.verify('user@example.com', 'correct horse battery');

    expect(check).toEqual({ userId: '11111111-1111-1111-1111-111111111111', aal: 1 });
    expect(hasher.dummyVerifyCalls).toBe(0);
  });

  it('rejects a wrong password after a real verify (no early return)', async () => {
    const hasher = new FakeHasher();
    hasher.verifyResult = false;
    const credentials = new IdentityCredentials(new FakeUsers(buildUser('active')), hasher);

    expect(await credentials.verify('user@example.com', 'wrong')).toBeNull();
  });

  it('rejects a non-active user even with the right password', async () => {
    const hasher = new FakeHasher();
    const credentials = new IdentityCredentials(
      new FakeUsers(buildUser('pending_verification')),
      hasher,
    );

    expect(await credentials.verify('user@example.com', 'correct horse battery')).toBeNull();
  });

  it('burns a dummy verify for an unknown user (anti-enumeration)', async () => {
    const hasher = new FakeHasher();
    const credentials = new IdentityCredentials(new FakeUsers(null), hasher);

    expect(await credentials.verify('nobody@example.com', 'whatever')).toBeNull();
    expect(hasher.dummyVerifyCalls).toBe(1);
  });

  it('burns a dummy verify for a malformed email (anti-enumeration)', async () => {
    const hasher = new FakeHasher();
    const credentials = new IdentityCredentials(new FakeUsers(buildUser('active')), hasher);

    expect(await credentials.verify('not-an-email', 'whatever')).toBeNull();
    expect(hasher.dummyVerifyCalls).toBe(1);
  });
});
