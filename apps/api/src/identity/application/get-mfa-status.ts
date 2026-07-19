import { type UserId } from '../../shared/kernel/user-id';
import { type MfaCredentialsRepository } from '../domain/ports/mfa-credentials-repository';
import { type RecoveryCodesRepository } from '../domain/ports/recovery-codes-repository';

export interface MfaStatus {
  enabled: boolean;
  recoveryCodesRemaining: number;
}

export class GetMfaStatusHandler {
  constructor(
    private readonly credentials: MfaCredentialsRepository,
    private readonly recovery: RecoveryCodesRepository,
  ) {}

  async execute(userId: UserId): Promise<MfaStatus> {
    const active = await this.credentials.findActiveTotpByUser(userId);
    const recoveryCodesRemaining = active ? await this.recovery.countActive(userId) : 0;
    return { enabled: active !== null, recoveryCodesRemaining };
  }
}

export const GET_MFA_STATUS_HANDLER = Symbol('GET_MFA_STATUS_HANDLER');
