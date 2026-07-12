import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type UserId } from '../../../shared/kernel/user-id';
import { type Session } from '../session';
import { type SessionId } from '../value-objects/session-id';

export interface SessionsRepository {
  create(session: Session, tx?: Tx): Promise<void>;
  findById(id: SessionId): Promise<Session | null>;
  listActiveByUser(userId: UserId): Promise<Session[]>;
  touch(id: SessionId, at: Date): Promise<void>;
  revoke(id: SessionId, at: Date, tx?: Tx): Promise<void>;
  revokeAllForUser(userId: UserId, at: Date, tx?: Tx): Promise<string[]>;
}

export const SESSIONS_REPOSITORY = Symbol('SESSIONS_REPOSITORY');
