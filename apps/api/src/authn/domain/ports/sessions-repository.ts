import { type Session } from '../session';
import { type SessionId } from '../value-objects/session-id';

export interface SessionsRepository {
  create(session: Session): Promise<void>;
  findById(id: SessionId): Promise<Session | null>;
  revoke(id: SessionId, at: Date): Promise<void>;
}

export const SESSIONS_REPOSITORY = Symbol('SESSIONS_REPOSITORY');
