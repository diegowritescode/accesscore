import { Module } from '@nestjs/common';
import { DefaultDenyPolicyDecisionPoint } from './domain/default-deny-pdp';
import { POLICY_DECISION_POINT } from './domain/policy-decision-point';

@Module({
  providers: [{ provide: POLICY_DECISION_POINT, useClass: DefaultDenyPolicyDecisionPoint }],
  exports: [POLICY_DECISION_POINT],
})
export class AuthzModule {}
