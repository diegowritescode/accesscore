export interface RevocationStore {
  revoke(subject: string, ttlSeconds: number): Promise<void>;
  isRevoked(subject: string): Promise<boolean>;
}

export const REVOCATION_STORE = Symbol('REVOCATION_STORE');
