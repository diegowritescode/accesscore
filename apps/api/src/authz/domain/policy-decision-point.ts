import {
  type Action,
  type Principal,
  type RequestContext,
  type Resource,
} from './authorization-request';
import { type Decision } from './decision';

export interface PolicyDecisionPoint {
  check(
    principal: Principal,
    action: Action,
    resource: Resource,
    context: RequestContext,
  ): Promise<Decision>;
}

export const POLICY_DECISION_POINT = Symbol('POLICY_DECISION_POINT');
