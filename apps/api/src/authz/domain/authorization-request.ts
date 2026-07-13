import { type EntityRef } from './entity-ref';

export { Action } from './action';

export interface Principal {
  readonly subject: EntityRef;
  readonly orgId: string | null;
  readonly assuranceLevel: number;
  readonly sessionId: string;
  readonly authenticatedAt: Date;
}

export type Resource = EntityRef;

export type ConsistencyRequirement =
  { readonly mode: 'full' } | { readonly mode: 'at-least'; readonly token: string };

export interface RequestContext {
  readonly ip: string;
  readonly requestId: string;
  readonly requestedAt: Date;
  readonly consistency: ConsistencyRequirement;
}
