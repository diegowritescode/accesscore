import { type Clock } from '../../shared/kernel/clock';
import { UserId } from '../../shared/kernel/user-id';
import { MfaCredential } from '../domain/mfa-credential';
import { type MfaCredentialsRepository } from '../domain/ports/mfa-credentials-repository';
import { type RecoveryCodesRepository } from '../domain/ports/recovery-codes-repository';
import { type AuditLog } from '../../security/domain/ports/audit-log';
import { DisableMfaHandler } from './disable-mfa';
import { GetMfaStatusHandler } from './get-mfa-status';

const audit: AuditLog = {
  append: () => Promise.resolve({ seq: 1, hash: 'h' }),
  verify: () => Promise.resolve({ ok: true, length: 0, brokenAt: null }),
};

const now = new Date('2026-07-19T00:00:00.000Z');
const clock: Clock = { now: () => now };
const userId = UserId.generate();

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
    return Promise.resolve(
      [...this.items.values()].find(
        (item) => item.userId.value === user.value && item.status === 'active',
      ) ?? null,
    );
  }
  findPendingTotpByUser(): Promise<MfaCredential | null> {
    return Promise.resolve(null);
  }
}

const recoveryWith = (remaining: number): RecoveryCodesRepository => ({
  replaceForUser: () => Promise.resolve(),
  findByHash: () => Promise.resolve(null),
  consume: () => Promise.resolve(true),
  countActive: () => Promise.resolve(remaining),
});

const withActive = (): MemoryCredentials => {
  const credentials = new MemoryCredentials();
  const credential = MfaCredential.enroll({ id: 'a1', userId, secretCiphertext: 'ct:x', now });
  credential.activate(now);
  credentials.items.set('a1', credential);
  return credentials;
};

describe('DisableMfaHandler', () => {
  it('revokes the active credential', async () => {
    const credentials = withActive();
    const result = await new DisableMfaHandler(credentials, clock, audit).execute({ userId });
    expect(result.ok).toBe(true);
    expect(credentials.items.get('a1')?.status).toBe('revoked');
  });

  it('rejects when MFA is not enabled', async () => {
    const result = await new DisableMfaHandler(new MemoryCredentials(), clock, audit).execute({
      userId,
    });
    expect(result).toEqual({ ok: false, error: 'not_enabled' });
  });
});

describe('GetMfaStatusHandler', () => {
  it('reports enabled with the remaining recovery-code count', async () => {
    const status = await new GetMfaStatusHandler(withActive(), recoveryWith(4)).execute(userId);
    expect(status).toEqual({ enabled: true, recoveryCodesRemaining: 4 });
  });

  it('reports disabled with no codes when there is no active credential', async () => {
    const status = await new GetMfaStatusHandler(new MemoryCredentials(), recoveryWith(9)).execute(
      userId,
    );
    expect(status).toEqual({ enabled: false, recoveryCodesRemaining: 0 });
  });
});
