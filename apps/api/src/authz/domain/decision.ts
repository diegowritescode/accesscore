export type Effect = 'permit' | 'deny';

export interface Reason {
  readonly code: string;
  readonly message: string;
}

export interface Decision {
  readonly effect: Effect;
  readonly reasons: readonly Reason[];
}
