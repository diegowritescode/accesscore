import { type TokenFamilyId } from './value-objects/token-family-id';

export type RefreshTokenStatus = 'active' | 'rotated' | 'revoked';

export interface RefreshToken {
  id: string;
  familyId: TokenFamilyId;
  tokenHash: string;
  generation: number;
  status: RefreshTokenStatus;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}
