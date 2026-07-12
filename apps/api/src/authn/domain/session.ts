import { type OrgId } from '../../shared/kernel/org-id';
import { type UserId } from '../../shared/kernel/user-id';
import { type SessionId } from './value-objects/session-id';

export type SessionStatus = 'active' | 'revoked';

export interface Session {
  id: SessionId;
  userId: UserId;
  orgId: OrgId | null;
  aal: number;
  authTime: Date;
  status: SessionStatus;
  deviceLabel: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}
