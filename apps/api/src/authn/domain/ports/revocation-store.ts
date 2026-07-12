export interface RevocationStore {
  revoke(jti: string, ttlSeconds: number): Promise<void>;
  isRevoked(jti: string): Promise<boolean>;
}

export const REVOCATION_STORE = Symbol('REVOCATION_STORE');
