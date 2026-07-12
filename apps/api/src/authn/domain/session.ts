import { type UserId } from '../../shared/kernel/user-id';
import { type SessionId } from './value-objects/session-id';

export type SessionStatus = 'active' | 'revoked';

export interface Session {
  id: SessionId;
  userId: UserId;
  status: SessionStatus;
  deviceLabel: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}
