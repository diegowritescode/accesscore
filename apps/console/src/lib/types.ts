export type Effect = 'permit' | 'deny';

export interface Reason {
  code: string;
  message: string;
  relation?: string;
  path?: string[];
}

export interface Decision {
  effect: Effect;
  reasons: Reason[];
}

export interface ExpandResponse {
  subjects: { type: string; id: string }[];
}

export interface SimulateResponse {
  decision: Decision;
  live: Decision;
  changed: boolean;
}

export interface EntityInput {
  type: string;
  id: string;
}

export interface CheckInput {
  subject: EntityInput;
  action: string;
  resource: EntityInput;
}

export interface ExpandInput {
  resource: EntityInput;
  relation: string;
}

export type PolicyEffect = 'permit' | 'forbid';

export interface PolicyOverlay {
  effect: PolicyEffect;
  resourceType: string;
  action: string;
  condition: unknown;
}

export interface SimulateInput {
  action: string;
  resource: EntityInput;
  policies?: PolicyOverlay[];
}
