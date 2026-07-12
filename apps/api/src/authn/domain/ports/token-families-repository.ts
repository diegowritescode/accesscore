import { type TokenFamily } from '../token-family';
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
}

export const TOKEN_FAMILIES_REPOSITORY = Symbol('TOKEN_FAMILIES_REPOSITORY');
