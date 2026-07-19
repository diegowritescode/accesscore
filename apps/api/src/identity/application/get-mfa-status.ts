import { type UserId } from '../../shared/kernel/user-id';
import { type MfaCredentialsRepository } from '../domain/ports/mfa-credentials-repository';

export interface MfaStatus {
  enabled: boolean;
}

export class GetMfaStatusHandler {
  constructor(private readonly credentials: MfaCredentialsRepository) {}

  async execute(userId: UserId): Promise<MfaStatus> {
    const active = await this.credentials.findActiveTotpByUser(userId);
    return { enabled: active !== null };
  }
}

export const GET_MFA_STATUS_HANDLER = Symbol('GET_MFA_STATUS_HANDLER');
