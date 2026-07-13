export type Effect = 'permit' | 'deny';

export interface Reason {
  readonly code: string;
  readonly message: string;
}

export interface Decision {
  readonly effect: Effect;
  readonly reasons: readonly Reason[];
}

export interface ResourceRef {
  readonly type: string;
  readonly id: string;
}

export interface CheckRequest {
  readonly action: string;
  readonly resource: ResourceRef;
  readonly consistencyToken?: string;
}

export const REASON_CODES = {
  DEFAULT_DENY: 'default_deny',
  UNKNOWN_ACTION: 'unknown_action',
  ORG_MISMATCH: 'org_mismatch',
  NO_ORG_CONTEXT: 'no_org_context',
  CONSISTENCY_UNAVAILABLE: 'consistency_unavailable',
  PDP_UNAVAILABLE: 'pdp_unavailable',
  UNAUTHENTICATED: 'unauthenticated',
} as const;

export type ReasonCode = (typeof REASON_CODES)[keyof typeof REASON_CODES];
