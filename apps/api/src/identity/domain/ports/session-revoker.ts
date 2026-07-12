import { type UserId } from '../../../shared/kernel/user-id';

export interface SessionRevoker {
  revokeAllForUser(userId: UserId): Promise<void>;
}

export const SESSION_REVOKER = Symbol('SESSION_REVOKER');
