export interface LockoutPolicy {
  threshold: number;
  windowSeconds: number;
}

export interface LockoutState {
  locked: boolean;
  retriesLeft: number;
}

export interface LockoutStore {
  registerFailure(key: string, policy: LockoutPolicy): Promise<LockoutState>;
  isLocked(key: string, policy: LockoutPolicy): Promise<boolean>;
  reset(key: string): Promise<void>;
}

export const LOCKOUT_STORE = Symbol('LOCKOUT_STORE');
