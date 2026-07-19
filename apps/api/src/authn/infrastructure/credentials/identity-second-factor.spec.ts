import { type RedeemRecoveryCodeHandler } from '../../../identity/application/redeem-recovery-code';
import { MfaCredential } from '../../../identity/domain/mfa-credential';
import { type MfaCredentialsRepository } from '../../../identity/domain/ports/mfa-credentials-repository';
import { type SecretEncryptor } from '../../../identity/domain/ports/secret-encryptor';
import { type Totp, type TotpVerifyOptions } from '../../../identity/domain/ports/totp';
import { type Clock } from '../../../shared/kernel/clock';
import { UserId } from '../../../shared/kernel/user-id';
import { IdentitySecondFactor } from './identity-second-factor';

const now = new Date('2026-07-19T00:00:00.000Z');
const clock: Clock = { now: () => now };
const userId = UserId.generate();

const encryptor: SecretEncryptor = {
  encrypt: () => Promise.resolve('ct:x'),
  decrypt: () => Promise.resolve(new Uint8Array([1, 2, 3])),
};

const redeem = (result: boolean): RedeemRecoveryCodeHandler =>
  ({ execute: () => Promise.resolve(result) }) as unknown as RedeemRecoveryCodeHandler;

const totp = (
  verification: { valid: boolean; step: number },
  capture?: (options: TotpVerifyOptions) => void,
): Totp => ({
  verify: (_secret, _code, _at, options) => {
    capture?.(options);
    return verification;
  },
});

class FakeMfa implements MfaCredentialsRepository {
  saved: MfaCredential[] = [];
  constructor(private readonly active: MfaCredential | null) {}
  save(credential: MfaCredential): Promise<void> {
    this.saved.push(credential);
    return Promise.resolve();
  }
  findById(): Promise<MfaCredential | null> {
    return Promise.resolve(null);
  }
  findActiveTotpByUser(): Promise<MfaCredential | null> {
    return Promise.resolve(this.active);
  }
  findPendingTotpByUser(): Promise<MfaCredential | null> {
    return Promise.resolve(null);
  }
}

const activeCredential = (): MfaCredential => {
  const credential = MfaCredential.enroll({ id: 'c1', userId, secretCiphertext: 'ct:s', now });
  credential.activate(now);
  credential.registerUse(5);
  return credential;
};

describe('IdentitySecondFactor', () => {
  it('delegates recovery codes to the redeem handler', async () => {
    const okFactor = new IdentitySecondFactor(
      new FakeMfa(null),
      encryptor,
      totp({ valid: false, step: -1 }),
      redeem(true),
      clock,
    );
    expect(await okFactor.verify(userId, { kind: 'recovery', value: 'AAAA-BBBB' })).toBe(true);

    const badFactor = new IdentitySecondFactor(
      new FakeMfa(null),
      encryptor,
      totp({ valid: false, step: -1 }),
      redeem(false),
      clock,
    );
    expect(await badFactor.verify(userId, { kind: 'recovery', value: 'nope' })).toBe(false);
  });

  it('rejects TOTP when no active credential exists', async () => {
    const factor = new IdentitySecondFactor(
      new FakeMfa(null),
      encryptor,
      totp({ valid: true, step: 6 }),
      redeem(false),
      clock,
    );
    expect(await factor.verify(userId, { kind: 'totp', value: '123456' })).toBe(false);
  });

  it('verifies a TOTP with the replay bound and advances the step', async () => {
    const credentials = new FakeMfa(activeCredential());
    const captured: { options?: TotpVerifyOptions } = {};
    const factor = new IdentitySecondFactor(
      credentials,
      encryptor,
      totp({ valid: true, step: 6 }, (options) => {
        captured.options = options;
      }),
      redeem(false),
      clock,
    );

    expect(await factor.verify(userId, { kind: 'totp', value: '123456' })).toBe(true);
    expect(captured.options?.afterStep).toBe(5);
    expect(credentials.saved[0]?.lastUsedStep).toBe(6);
  });

  it('rejects an invalid TOTP without saving', async () => {
    const credentials = new FakeMfa(activeCredential());
    const factor = new IdentitySecondFactor(
      credentials,
      encryptor,
      totp({ valid: false, step: -1 }),
      redeem(false),
      clock,
    );
    expect(await factor.verify(userId, { kind: 'totp', value: '000000' })).toBe(false);
    expect(credentials.saved).toHaveLength(0);
  });
});
