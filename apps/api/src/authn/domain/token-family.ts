import { type UserId } from '../../shared/kernel/user-id';
import { type SessionId } from './value-objects/session-id';
import { type TokenFamilyId } from './value-objects/token-family-id';

export type TokenFamilyStatus = 'active' | 'revoked';

export interface TokenFamily {
  id: TokenFamilyId;
  userId: UserId;
  sessionId: SessionId;
  status: TokenFamilyStatus;
  createdAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
}
