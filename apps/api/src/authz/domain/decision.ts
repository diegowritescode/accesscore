export type Effect = 'permit' | 'deny';

export interface Reason {
  readonly code: string;
  readonly message: string;
  readonly relation?: string;
  readonly path?: readonly string[];
}

export interface Decision {
  readonly effect: Effect;
  readonly reasons: readonly Reason[];
}
