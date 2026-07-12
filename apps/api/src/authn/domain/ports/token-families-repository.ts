import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type UserId } from '../../../identity/domain/value-objects/user-id';
import { type TokenFamily } from '../token-family';
import { type SessionId } from '../value-objects/session-id';
import { type TokenFamilyId } from '../value-objects/token-family-id';

export interface ReuseEvent {
  userId: string;
  sessionId: string;
  generation: number;
}

export interface TokenFamiliesRepository {
  create(family: TokenFamily, tx?: Tx): Promise<void>;
  findById(id: TokenFamilyId): Promise<TokenFamily | null>;
  revoke(id: TokenFamilyId, reason: string, at: Date): Promise<void>;
  revokeForReuse(id: TokenFamilyId, at: Date, event: ReuseEvent): Promise<void>;
  revokeBySession(sessionId: SessionId, reason: string, at: Date, tx?: Tx): Promise<void>;
  revokeAllForUser(userId: UserId, reason: string, at: Date, tx?: Tx): Promise<void>;
}

export const TOKEN_FAMILIES_REPOSITORY = Symbol('TOKEN_FAMILIES_REPOSITORY');
