import {
  type Action,
  type Principal,
  type RequestContext,
  type Resource,
} from './authorization-request';
import { type Decision } from './decision';
import { type EntityRef } from './entity-ref';
import { type Policy } from './policy/policy';

export interface BatchCheckRequest {
  readonly principal: Principal;
  readonly action: Action;
  readonly resource: Resource;
  readonly context: RequestContext;
}

export interface SimulationResult {
  readonly decision: Decision;
  readonly live: Decision;
  readonly changed: boolean;
}

export interface PolicyDecisionPoint {
  check(
    principal: Principal,
    action: Action,
    resource: Resource,
    context: RequestContext,
  ): Promise<Decision>;
  batchCheck(requests: readonly BatchCheckRequest[]): Promise<Decision[]>;
  expand(principal: Principal, resource: Resource, relation: string): Promise<EntityRef[]>;
  simulate(
    principal: Principal,
    action: Action,
    resource: Resource,
    context: RequestContext,
    overlay: readonly Policy[] | null,
  ): Promise<SimulationResult>;
}

export const POLICY_DECISION_POINT = Symbol('POLICY_DECISION_POINT');
