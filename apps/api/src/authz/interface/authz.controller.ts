import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Ip,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard, type AuthTokenClaims } from '../../authn/interface/access-token.guard';
import { AuthToken } from '../../authn/interface/auth-token.decorator';
import { ProblemException } from '../../shared/http/problem-details';
import { CLOCK, type Clock } from '../../shared/kernel/clock';
import { Action } from '../domain/action';
import { type ConsistencyRequirement, type Principal } from '../domain/authorization-request';
import { ConsistencyToken } from '../domain/consistency-token';
import { POLICY_DECISION_POINT, type PolicyDecisionPoint } from '../domain/policy-decision-point';
import { checkSchema } from './check.dto';
import { RequirePermission, resourceFromParam } from './require-permission.decorator';

interface CheckResponse {
  effect: string;
  reasons: { code: string; message: string }[];
}

const badRequest = (): ProblemException =>
  new ProblemException({ type: 'about:blank', title: 'Invalid authorization query', status: 400 });

@Controller('authz')
export class AuthzController {
  constructor(
    @Inject(POLICY_DECISION_POINT) private readonly pdp: PolicyDecisionPoint,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Post('check')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async check(
    @AuthToken() token: AuthTokenClaims,
    @Body() body: unknown,
    @Ip() ip: string,
  ): Promise<CheckResponse> {
    const parsed = checkSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest();
    }

    const action = Action.create(parsed.data.action);
    if (!action.ok) {
      throw badRequest();
    }

    let consistency: ConsistencyRequirement = { mode: 'full' };
    if (parsed.data.consistency_token !== undefined) {
      try {
        ConsistencyToken.decode(parsed.data.consistency_token);
      } catch {
        throw badRequest();
      }
      consistency = { mode: 'at-least', token: parsed.data.consistency_token };
    }

    const principal: Principal = {
      subject: { type: 'user', id: token.sub },
      orgId: token.org,
      assuranceLevel: token.aal,
      sessionId: token.sid,
    };

    const decision = await this.pdp.check(
      principal,
      action.value,
      { type: parsed.data.resource.type, id: parsed.data.resource.id },
      { ip: ip || 'unknown', requestId: randomUUID(), requestedAt: this.clock.now(), consistency },
    );

    return {
      effect: decision.effect,
      reasons: decision.reasons.map((reason) => ({ code: reason.code, message: reason.message })),
    };
  }

  @Get('documents/:id')
  @RequirePermission('document.read', resourceFromParam('document', 'id'))
  readDocument(@Param('id') id: string): { document: { id: string } } {
    return { document: { id } };
  }
}
