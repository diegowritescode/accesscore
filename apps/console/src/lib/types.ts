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

export interface NamespaceSummary {
  namespace: string;
  relations: string[];
  actions: string[];
  revision: number;
}

export interface NamespaceDetail {
  namespace: string;
  relations: string[];
  actions: Record<string, string[]>;
  rewrites: Record<string, unknown>;
  revision: number;
}

export interface TupleSubject {
  type: string;
  id: string;
  relation?: string;
}

export interface TupleView {
  object: { type: string; id: string };
  relation: string;
  subject: TupleSubject;
  revision: number;
}

export interface PolicyView {
  id: string;
  effect: PolicyEffect;
  resourceType: string;
  action: string;
  condition: unknown;
  revision: number;
}

export interface CheckAsInput {
  subject: EntityInput;
  action: string;
  resource: EntityInput;
  aal?: number;
}
