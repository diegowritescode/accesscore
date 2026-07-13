import { randomUUID } from 'node:crypto';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthenticatedRequest } from '../../authn/interface/access-token.guard';
import { ProblemException } from '../../shared/http/problem-details';
import { CLOCK, type Clock } from '../../shared/kernel/clock';
import { Action } from '../domain/action';
import { type Principal } from '../domain/authorization-request';
import { type Decision } from '../domain/decision';
import { type EntityRef } from '../domain/entity-ref';
import { POLICY_DECISION_POINT, type PolicyDecisionPoint } from '../domain/policy-decision-point';
import { REQUIRE_PERMISSION, type RequiredPermission } from './require-permission.metadata';

const forbidden = (): ProblemException =>
  new ProblemException({ type: 'about:blank', title: 'Forbidden', status: 403 });

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(POLICY_DECISION_POINT) private readonly pdp: PolicyDecisionPoint,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredPermission | undefined>(
      REQUIRE_PERMISSION,
      context.getHandler(),
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.authToken;
    if (!token) {
      throw forbidden();
    }

    const action = Action.create(required.action);
    if (!action.ok) {
      throw forbidden();
    }

    const principal: Principal = {
      subject: { type: 'user', id: token.sub },
      orgId: token.org,
      assuranceLevel: token.aal,
      sessionId: token.sid,
    };

    const decision = await this.decide(
      principal,
      action.value,
      required.resource(request),
      request,
    );
    if (!decision || decision.effect !== 'permit') {
      throw forbidden();
    }
    return true;
  }

  private async decide(
    principal: Principal,
    action: Action,
    resource: EntityRef,
    request: AuthenticatedRequest,
  ): Promise<Decision | null> {
    try {
      return await this.pdp.check(principal, action, resource, {
        ip: request.ip ?? 'unknown',
        requestId: randomUUID(),
        requestedAt: this.clock.now(),
        consistency: { mode: 'full' },
      });
    } catch {
      return null;
    }
  }
}
