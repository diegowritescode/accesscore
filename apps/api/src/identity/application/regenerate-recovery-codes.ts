import { type UserId } from '../../shared/kernel/user-id';
import { err, ok, type Result } from '../../shared/result';
import { type MfaCredentialsRepository } from '../domain/ports/mfa-credentials-repository';
import { type RecoveryCodeIssuer } from './recovery-code-issuer';

export interface RegenerateRecoveryCodesInput {
  userId: UserId;
}

export interface RegenerateRecoveryCodesResult {
  recoveryCodes: string[];
}

export type RegenerateRecoveryCodesError = 'not_enabled';

export class RegenerateRecoveryCodesHandler {
  constructor(
    private readonly credentials: MfaCredentialsRepository,
    private readonly recoveryCodes: RecoveryCodeIssuer,
  ) {}

  async execute(
    input: RegenerateRecoveryCodesInput,
  ): Promise<Result<RegenerateRecoveryCodesResult, RegenerateRecoveryCodesError>> {
    const active = await this.credentials.findActiveTotpByUser(input.userId);
    if (!active) {
      return err('not_enabled');
    }
    const recoveryCodes = await this.recoveryCodes.issue(input.userId);
    return ok({ recoveryCodes });
  }
}

export const REGENERATE_RECOVERY_CODES_HANDLER = Symbol('REGENERATE_RECOVERY_CODES_HANDLER');
