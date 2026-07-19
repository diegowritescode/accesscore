import { type UserId } from '../../../shared/kernel/user-id';
import { type MfaCredential } from '../mfa-credential';

export interface MfaCredentialsRepository {
  save(credential: MfaCredential): Promise<void>;
  findById(id: string): Promise<MfaCredential | null>;
  findActiveTotpByUser(userId: UserId): Promise<MfaCredential | null>;
  findPendingTotpByUser(userId: UserId): Promise<MfaCredential | null>;
}

export const MFA_CREDENTIALS_REPOSITORY = Symbol('MFA_CREDENTIALS_REPOSITORY');
