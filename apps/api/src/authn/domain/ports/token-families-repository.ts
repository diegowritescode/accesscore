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
  create(family: TokenFamily): Promise<void>;
  findById(id: TokenFamilyId): Promise<TokenFamily | null>;
  revoke(id: TokenFamilyId, reason: string, at: Date): Promise<void>;
  revokeForReuse(id: TokenFamilyId, at: Date, event: ReuseEvent): Promise<void>;
  revokeBySession(sessionId: SessionId, reason: string, at: Date): Promise<void>;
  revokeAllForUser(userId: UserId, reason: string, at: Date): Promise<void>;
}

export const TOKEN_FAMILIES_REPOSITORY = Symbol('TOKEN_FAMILIES_REPOSITORY');
