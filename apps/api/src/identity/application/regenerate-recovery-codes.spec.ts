import { UserId } from '../../shared/kernel/user-id';
import { MfaCredential } from '../domain/mfa-credential';
import { type MfaCredentialsRepository } from '../domain/ports/mfa-credentials-repository';
import { type RecoveryCodeIssuer } from './recovery-code-issuer';
import { RegenerateRecoveryCodesHandler } from './regenerate-recovery-codes';

const now = new Date('2026-07-19T00:00:00.000Z');
const userId = UserId.generate();

const issuer = {
  issue: () => Promise.resolve(['A-B', 'C-D']),
} as unknown as RecoveryCodeIssuer;

const credentialsWith = (active: MfaCredential | null): MfaCredentialsRepository => ({
  save: () => Promise.resolve(),
  findById: () => Promise.resolve(null),
  findActiveTotpByUser: () => Promise.resolve(active),
  findPendingTotpByUser: () => Promise.resolve(null),
});

const activeCredential = (): MfaCredential => {
  const credential = MfaCredential.enroll({ id: 'a1', userId, secretCiphertext: 'ct:x', now });
  credential.activate(now);
  return credential;
};

describe('RegenerateRecoveryCodesHandler', () => {
  it('issues a fresh batch when MFA is active', async () => {
    const handler = new RegenerateRecoveryCodesHandler(credentialsWith(activeCredential()), issuer);
    const result = await handler.execute({ userId });
    expect(result).toEqual({ ok: true, value: { recoveryCodes: ['A-B', 'C-D'] } });
  });

  it('rejects when MFA is not enabled', async () => {
    const handler = new RegenerateRecoveryCodesHandler(credentialsWith(null), issuer);
    expect(await handler.execute({ userId })).toEqual({ ok: false, error: 'not_enabled' });
  });
});
