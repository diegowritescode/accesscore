import { randomUUID } from 'node:crypto';
import { Body, Controller, HttpCode, Inject, Ip, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard, type AuthTokenClaims } from '../../authn/interface/access-token.guard';
import { AuthToken } from '../../authn/interface/auth-token.decorator';
import { ProblemException } from '../../shared/http/problem-details';
import { CLOCK, type Clock } from '../../shared/kernel/clock';
import { Action } from '../domain/action';
import {
  type ConsistencyRequirement,
  type Principal,
  type RequestContext,
} from '../domain/authorization-request';
import { ConsistencyToken } from '../domain/consistency-token';
import { type Decision } from '../domain/decision';
import {
  type BatchCheckRequest,
  POLICY_DECISION_POINT,
  type PolicyDecisionPoint,
} from '../domain/policy-decision-point';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { openApiSchema } from '../../shared/http/openapi-schema';
import { batchCheckSchema, type CheckDto, checkSchema, expandSchema } from './check.dto';
import { PapAdminGuard } from './pap-admin.guard';

interface CheckResponse {
  effect: string;
  reasons: { code: string; message: string }[];
}

const badRequest = (): ProblemException =>
  new ProblemException({ type: 'about:blank', title: 'Invalid authorization query', status: 400 });

const unavailable = (): ProblemException =>
  new ProblemException({
    type: 'about:blank',
    title: 'Authorization service unavailable',
    status: 503,
  });

const toResponse = (decision: Decision): CheckResponse => ({
  effect: decision.effect,
  reasons: decision.reasons.map((reason) => ({ code: reason.code, message: reason.message })),
});

@ApiTags('authz')
@ApiBearerAuth('access-token')
@Controller('authz')
export class AuthzController {
  constructor(
    @Inject(POLICY_DECISION_POINT) private readonly pdp: PolicyDecisionPoint,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Post('check')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiOperation({
    summary: 'Check one authorization decision',
    description:
      'Resolves whether the authenticated principal may perform the action on the resource, ' +
      'walking the ReBAC graph (direct, computed_userset, tuple_to_userset, nested groups). ' +
      'Returns permit/deny with explainable reason codes; optionally consistency-gated by a zookie.',
  })
  @ApiBody({ schema: openApiSchema(checkSchema) })
  @ApiResponse({ status: 200, description: 'The decision, with reason codes.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token.' })
  async check(
    @AuthToken() token: AuthTokenClaims,
    @Body() body: unknown,
    @Ip() ip: string,
  ): Promise<CheckResponse> {
    const parsed = checkSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest();
    }
    const request = this.toRequest(token, parsed.data, ip);
    try {
      return toResponse(
        await this.pdp.check(request.principal, request.action, request.resource, request.context),
      );
    } catch {
      throw unavailable();
    }
  }

  @Post('batch-check')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiOperation({
    summary: 'Check many decisions against one snapshot',
    description:
      'Evaluates up to 50 queries against a single consistent snapshot in one round-trip, ' +
      'each gated and logged independently. Results are index-aligned with the request.',
  })
  @ApiBody({ schema: openApiSchema(batchCheckSchema) })
  @ApiResponse({ status: 200, description: 'One decision per query, in order.' })
  async batchCheck(
    @AuthToken() token: AuthTokenClaims,
    @Body() body: unknown,
    @Ip() ip: string,
  ): Promise<{ results: CheckResponse[] }> {
    const parsed = batchCheckSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest();
    }
    const requests = parsed.data.checks.map((item) => this.toRequest(token, item, ip));
    try {
      const decisions = await this.pdp.batchCheck(requests);
      return { results: decisions.map(toResponse) };
    } catch {
      throw unavailable();
    }
  }

  @Post('expand')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, PapAdminGuard)
  @ApiOperation({
    summary: 'Expand a relation to its resolved members',
    description:
      'Owner-gated. Returns the full set of subjects that hold the relation on the resource, ' +
      'resolved across every userset rewrite (role aliasing, nested groups, hierarchy).',
  })
  @ApiBody({ schema: openApiSchema(expandSchema) })
  @ApiResponse({ status: 200, description: 'The resolved subject closure.' })
  async expand(
    @AuthToken() token: AuthTokenClaims,
    @Body() body: unknown,
  ): Promise<{ subjects: { type: string; id: string }[] }> {
    const parsed = expandSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest();
    }
    try {
      const members = await this.pdp.expand(
        this.principalOf(token),
        { type: parsed.data.resource.type, id: parsed.data.resource.id },
        parsed.data.relation,
      );
      return { subjects: members.map((member) => ({ type: member.type, id: member.id })) };
    } catch {
      throw unavailable();
    }
  }

  private toRequest(token: AuthTokenClaims, data: CheckDto, ip: string): BatchCheckRequest {
    const action = Action.create(data.action);
    if (!action.ok) {
      throw badRequest();
    }
    let consistency: ConsistencyRequirement = { mode: 'full' };
    if (data.consistency_token !== undefined) {
      try {
        ConsistencyToken.decode(data.consistency_token);
      } catch {
        throw badRequest();
      }
      consistency = { mode: 'at-least', token: data.consistency_token };
    }
    return {
      principal: this.principalOf(token),
      action: action.value,
      resource: { type: data.resource.type, id: data.resource.id },
      context: this.contextOf(ip, consistency),
    };
  }

  private contextOf(ip: string, consistency: ConsistencyRequirement): RequestContext {
    return {
      ip: ip || 'unknown',
      requestId: randomUUID(),
      requestedAt: this.clock.now(),
      consistency,
    };
  }

  private principalOf(token: AuthTokenClaims): Principal {
    return {
      subject: { type: 'user', id: token.sub },
      orgId: token.org,
      assuranceLevel: token.aal,
      sessionId: token.sid,
    };
  }
}
