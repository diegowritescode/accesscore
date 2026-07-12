import { type Tx } from '../../../shared/persistence/unit-of-work';
import { type RefreshToken } from '../refresh-token';
import { type TokenFamilyId } from '../value-objects/token-family-id';

export interface RefreshTokensRepository {
  add(token: RefreshToken, tx?: Tx): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  findActiveByFamily(familyId: TokenFamilyId): Promise<RefreshToken | null>;
  rotate(presentedId: string, successor: RefreshToken, at: Date): Promise<boolean>;
}

export const REFRESH_TOKENS_REPOSITORY = Symbol('REFRESH_TOKENS_REPOSITORY');
