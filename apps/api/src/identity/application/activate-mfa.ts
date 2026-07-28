import { type AuditLog } from '../../security/domain/ports/audit-log';
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
  steppedUp: boolean;
}

export interface ActivateMfaResult {
  recoveryCodes: string[];
}

export type ActivateMfaError = 'no_pending_credential' | 'invalid_code' | 'step_up_required';

const DRIFT_WINDOW = 1;

export class ActivateMfaHandler {
  constructor(
    private readonly credentials: MfaCredentialsRepository,
    private readonly encryptor: SecretEncryptor,
    private readonly totp: Totp,
    private readonly clock: Clock,
    private readonly recoveryCodes: RecoveryCodeIssuer,
    private readonly audit: AuditLog,
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
      if (!input.steppedUp) {
        return err('step_up_required');
      }
      active.revoke(now);
      await this.credentials.save(active);
    }

    pending.activate(now);
    pending.registerUse(verification.step);
    await this.credentials.save(pending);

    const recoveryCodes = await this.recoveryCodes.issue(input.userId);
    await this.audit.append({
      type: 'mfa.activated',
      orgId: null,
      subject: input.userId.value,
      payload: { credentialId: pending.id },
    });
    return ok({ recoveryCodes });
  }
}

export const ACTIVATE_MFA_HANDLER = Symbol('ACTIVATE_MFA_HANDLER');
