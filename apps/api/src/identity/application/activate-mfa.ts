import { type Clock } from '../../shared/kernel/clock';
import { type UserId } from '../../shared/kernel/user-id';
import { err, ok, type Result } from '../../shared/result';
import { type MfaCredentialsRepository } from '../domain/ports/mfa-credentials-repository';
import { type SecretEncryptor } from '../domain/ports/secret-encryptor';
import { type Totp } from '../domain/ports/totp';
import { type RecoveryCodeIssuer } from './recovery-code-issuer';

export interface ActivateMfaInput {
  userId: UserId;
  code: string;
}

export interface ActivateMfaResult {
  recoveryCodes: string[];
}

export type ActivateMfaError = 'no_pending_credential' | 'invalid_code';

const DRIFT_WINDOW = 1;

export class ActivateMfaHandler {
  constructor(
    private readonly credentials: MfaCredentialsRepository,
    private readonly encryptor: SecretEncryptor,
    private readonly totp: Totp,
    private readonly clock: Clock,
    private readonly recoveryCodes: RecoveryCodeIssuer,
  ) {}

  async execute(input: ActivateMfaInput): Promise<Result<ActivateMfaResult, ActivateMfaError>> {
    const pending = await this.credentials.findPendingTotpByUser(input.userId);
    if (!pending) {
      return err('no_pending_credential');
    }

    const now = this.clock.now();
    const secret = await this.encryptor.decrypt(pending.secretCiphertext);
    const verification = this.totp.verify(secret, input.code, now, { window: DRIFT_WINDOW });
    if (!verification.valid) {
      return err('invalid_code');
    }

    const active = await this.credentials.findActiveTotpByUser(input.userId);
    if (active) {
      active.revoke(now);
      await this.credentials.save(active);
    }

    pending.activate(now);
    pending.registerUse(verification.step);
    await this.credentials.save(pending);

    const recoveryCodes = await this.recoveryCodes.issue(input.userId);
    return ok({ recoveryCodes });
  }
}

export const ACTIVATE_MFA_HANDLER = Symbol('ACTIVATE_MFA_HANDLER');
