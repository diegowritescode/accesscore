import {
  type Action,
  type Principal,
  type RequestContext,
  type Resource,
} from './authorization-request';
import { type Decision } from './decision';
import { type PolicyDecisionPoint } from './policy-decision-point';

export class DefaultDenyPolicyDecisionPoint implements PolicyDecisionPoint {
  check(
    _principal: Principal,
    _action: Action,
    _resource: Resource,
    _context: RequestContext,
  ): Promise<Decision> {
    return Promise.resolve({
      effect: 'deny',
      reasons: [
        {
          code: 'default_deny',
          message: 'No permit rule was evaluated; access is denied by default.',
        },
      ],
    });
  }
}
