import { type Clock } from '../../shared/kernel/clock';
import { UserId } from '../../shared/kernel/user-id';
import { MfaCredential } from '../domain/mfa-credential';
import { type MfaCredentialsRepository } from '../domain/ports/mfa-credentials-repository';
import { type SecretEncryptor } from '../domain/ports/secret-encryptor';
import { type Totp, type TotpVerification } from '../domain/ports/totp';
import { ActivateMfaHandler } from './activate-mfa';

const now = new Date('2026-07-19T00:00:00.000Z');
const clock: Clock = { now: () => now };
const userId = UserId.generate();

const encryptor: SecretEncryptor = {
  encrypt: (plaintext) => Promise.resolve(`ct:${Buffer.from(plaintext).toString('base64')}`),
  decrypt: (ciphertext) =>
    Promise.resolve(new Uint8Array(Buffer.from(ciphertext.slice(3), 'base64'))),
};

const totpReturning = (verification: TotpVerification): Totp => ({ verify: () => verification });

class MemoryCredentials implements MfaCredentialsRepository {
  readonly items = new Map<string, MfaCredential>();
  save(credential: MfaCredential): Promise<void> {
    this.items.set(credential.id, credential);
    return Promise.resolve();
  }
  findById(id: string): Promise<MfaCredential | null> {
    return Promise.resolve(this.items.get(id) ?? null);
  }
  findActiveTotpByUser(user: UserId): Promise<MfaCredential | null> {
    return this.byStatus(user, 'active');
  }
  findPendingTotpByUser(user: UserId): Promise<MfaCredential | null> {
    return this.byStatus(user, 'pending');
  }
  private byStatus(user: UserId, status: string): Promise<MfaCredential | null> {
    return Promise.resolve(
      [...this.items.values()].find(
        (item) => item.userId.value === user.value && item.status === status,
      ) ?? null,
    );
  }
}

const withPending = (id = 'p1'): MemoryCredentials => {
  const credentials = new MemoryCredentials();
  credentials.items.set(id, MfaCredential.enroll({ id, userId, secretCiphertext: 'ct:xxx', now }));
  return credentials;
};

describe('ActivateMfaHandler', () => {
  it('rejects when there is no pending credential', async () => {
    const handler = new ActivateMfaHandler(
      new MemoryCredentials(),
      encryptor,
      totpReturning({ valid: false, step: -1 }),
      clock,
    );
    expect(await handler.execute({ userId, code: '000000' })).toEqual({
      ok: false,
      error: 'no_pending_credential',
    });
  });

  it('rejects an invalid code', async () => {
    const handler = new ActivateMfaHandler(
      withPending(),
      encryptor,
      totpReturning({ valid: false, step: -1 }),
      clock,
    );
    expect(await handler.execute({ userId, code: '000000' })).toEqual({
      ok: false,
      error: 'invalid_code',
    });
  });

  it('activates the pending credential and seeds the last used step', async () => {
    const credentials = withPending();
    const handler = new ActivateMfaHandler(
      credentials,
      encryptor,
      totpReturning({ valid: true, step: 7 }),
      clock,
    );

    const result = await handler.execute({ userId, code: '287082' });

    expect(result.ok).toBe(true);
    const active = await credentials.findActiveTotpByUser(userId);
    expect(active?.status).toBe('active');
    expect(active?.lastUsedStep).toBe(7);
  });

  it('supersedes a previously active credential', async () => {
    const credentials = withPending();
    const previous = MfaCredential.enroll({
      id: 'active-old',
      userId,
      secretCiphertext: 'ct:old',
      now,
    });
    previous.activate(now);
    credentials.items.set('active-old', previous);

    const handler = new ActivateMfaHandler(
      credentials,
      encryptor,
      totpReturning({ valid: true, step: 9 }),
      clock,
    );
    await handler.execute({ userId, code: '123456' });

    expect(credentials.items.get('active-old')?.status).toBe('revoked');
    expect((await credentials.findActiveTotpByUser(userId))?.id).toBe('p1');
  });
});
