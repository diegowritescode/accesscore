import { type RedeemRecoveryCodeHandler } from '../../../identity/application/redeem-recovery-code';
import { type MfaCredentialsRepository } from '../../../identity/domain/ports/mfa-credentials-repository';
import { type SecretEncryptor } from '../../../identity/domain/ports/secret-encryptor';
import { type Totp } from '../../../identity/domain/ports/totp';
import { type Clock } from '../../../shared/kernel/clock';
import { type UserId } from '../../../shared/kernel/user-id';
import { type SecondFactor, type SecondFactorProof } from '../../domain/ports/second-factor';

const DRIFT_WINDOW = 1;

export class IdentitySecondFactor implements SecondFactor {
  constructor(
    private readonly credentials: MfaCredentialsRepository,
    private readonly encryptor: SecretEncryptor,
    private readonly totp: Totp,
    private readonly redeem: RedeemRecoveryCodeHandler,
    private readonly clock: Clock,
  ) {}

  async verify(userId: UserId, proof: SecondFactorProof): Promise<boolean> {
    if (proof.kind === 'recovery') {
      return this.redeem.execute({ userId, code: proof.value });
    }

    const credential = await this.credentials.findActiveTotpByUser(userId);
    if (!credential) {
      return false;
    }
    const secret = await this.encryptor.decrypt(credential.secretCiphertext);
    const verification = this.totp.verify(secret, proof.value, this.clock.now(), {
      window: DRIFT_WINDOW,
      afterStep: credential.lastUsedStep ?? undefined,
    });
    if (!verification.valid) {
      return false;
    }
    credential.registerUse(verification.step);
    await this.credentials.save(credential);
    return true;
  }
}
