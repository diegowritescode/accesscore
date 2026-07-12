import { type UserId } from '../../../identity/domain/value-objects/user-id';
import { type Session } from '../session';
import { type SessionId } from '../value-objects/session-id';

export interface SessionsRepository {
  create(session: Session): Promise<void>;
  findById(id: SessionId): Promise<Session | null>;
  revoke(id: SessionId, at: Date): Promise<void>;
  revokeAllForUser(userId: UserId, at: Date): Promise<string[]>;
}

export const SESSIONS_REPOSITORY = Symbol('SESSIONS_REPOSITORY');
