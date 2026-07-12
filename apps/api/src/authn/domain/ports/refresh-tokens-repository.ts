import { type RefreshToken } from '../refresh-token';

export interface RefreshTokensRepository {
  add(token: RefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
}

export const REFRESH_TOKENS_REPOSITORY = Symbol('REFRESH_TOKENS_REPOSITORY');
