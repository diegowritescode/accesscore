import { type Decision } from '../decision';
import { evalCondition } from './evaluate-condition';
import { type EvaluationContext } from './evaluation-context';
import { type Policy } from './policy';

export function decide(
  rebac: Decision,
  policies: readonly Policy[],
  ctx: EvaluationContext,
): Decision {
  for (const policy of policies) {
    if (policy.effect === 'forbid' && evalCondition(policy.condition, ctx) !== false) {
      return {
        effect: 'deny',
        reasons: [
          {
            code: 'forbid_matched',
            message: `Denied by an explicit forbid policy (${policy.id}).`,
          },
        ],
      };
    }
  }
  if (rebac.effect === 'permit') {
    return rebac;
  }
  for (const policy of policies) {
    if (policy.effect === 'permit' && evalCondition(policy.condition, ctx) === true) {
      return {
        effect: 'permit',
        reasons: [{ code: 'grant.policy', message: `Permitted by policy ${policy.id}.` }],
      };
    }
  }
  return rebac;
}
