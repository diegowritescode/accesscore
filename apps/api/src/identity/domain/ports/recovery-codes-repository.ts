import { type UserId } from '../../../shared/kernel/user-id';
import { type RecoveryCode } from '../recovery-code';

export interface RecoveryCodesRepository {
  replaceForUser(userId: UserId, codes: RecoveryCode[]): Promise<void>;
  findByHash(userId: UserId, codeHash: string): Promise<RecoveryCode | null>;
  consume(code: RecoveryCode): Promise<void>;
  countActive(userId: UserId): Promise<number>;
}

export const RECOVERY_CODES_REPOSITORY = Symbol('RECOVERY_CODES_REPOSITORY');
