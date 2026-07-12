export interface GracePair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  successorGeneration: number;
}

export interface RefreshGraceCache {
  get(presentedHash: string): Promise<GracePair | null>;
  put(presentedHash: string, pair: GracePair, ttlSeconds: number): Promise<void>;
}

export const REFRESH_GRACE_CACHE = Symbol('REFRESH_GRACE_CACHE');
