import { Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, type AuthTokenClaims } from '../../authn/interface/access-token.guard';
import { AuthToken } from '../../authn/interface/auth-token.decorator';
import { StepUpGuard } from '../../authn/interface/step-up.guard';
import { ProblemException } from '../../shared/http/problem-details';
import { openApiSchema } from '../../shared/http/openapi-schema';
import { UserId } from '../../shared/kernel/user-id';
import { ACTIVATE_MFA_HANDLER, type ActivateMfaHandler } from '../application/activate-mfa';
import { DISABLE_MFA_HANDLER, type DisableMfaHandler } from '../application/disable-mfa';
import { ENROLL_MFA_HANDLER, type EnrollMfaHandler } from '../application/enroll-mfa';
import {
  GET_MFA_STATUS_HANDLER,
  type GetMfaStatusHandler,
  type MfaStatus,
} from '../application/get-mfa-status';
import {
  REGENERATE_RECOVERY_CODES_HANDLER,
  type RegenerateRecoveryCodesHandler,
} from '../application/regenerate-recovery-codes';
import { activateMfaSchema } from './mfa.dto';

@ApiTags('mfa')
@ApiBearerAuth('access-token')
@Controller('auth/mfa')
@UseGuards(AccessTokenGuard)
export class MfaController {
  constructor(
    @Inject(ENROLL_MFA_HANDLER) private readonly enrollHandler: EnrollMfaHandler,
    @Inject(ACTIVATE_MFA_HANDLER) private readonly activateHandler: ActivateMfaHandler,
    @Inject(DISABLE_MFA_HANDLER) private readonly disableHandler: DisableMfaHandler,
    @Inject(GET_MFA_STATUS_HANDLER) private readonly statusHandler: GetMfaStatusHandler,
    @Inject(REGENERATE_RECOVERY_CODES_HANDLER)
    private readonly regenerateHandler: RegenerateRecoveryCodesHandler,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether the caller has an active MFA factor and codes remaining' })
  async status(@AuthToken() token: AuthTokenClaims): Promise<MfaStatus> {
    return this.statusHandler.execute(UserId.fromString(token.sub));
  }

  @Post('enroll')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Start TOTP enrollment',
    description: 'Provisions a pending TOTP secret and returns the otpauth:// URI to scan.',
  })
  async enroll(@AuthToken() token: AuthTokenClaims): Promise<{ otpauthUri: string }> {
    const result = await this.enrollHandler.execute({ userId: UserId.fromString(token.sub) });
    if (!result.ok) {
      throw new ProblemException({ type: 'about:blank', title: 'Unauthorized', status: 401 });
    }
    return { otpauthUri: result.value.otpauthUri };
  }

  @Post('activate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Activate the pending TOTP factor',
    description: 'Verifies the first code against the pending secret and enables MFA.',
  })
  @ApiBody({ schema: openApiSchema(activateMfaSchema) })
  async activate(
    @AuthToken() token: AuthTokenClaims,
    @Body() body: unknown,
  ): Promise<{ status: string; recoveryCodes: string[] }> {
    const parsed = activateMfaSchema.safeParse(body);
    if (!parsed.success) {
      throw new ProblemException({ type: 'about:blank', title: 'Invalid code', status: 422 });
    }
    const result = await this.activateHandler.execute({
      userId: UserId.fromString(token.sub),
      code: parsed.data.code,
      steppedUp: token.aal >= 2,
    });
    if (!result.ok) {
      if (result.error === 'step_up_required') {
        throw new ProblemException({
          type: 'about:blank',
          title: 'Step-up required',
          status: 403,
          detail: 'step_up_required',
        });
      }
      const status = result.error === 'no_pending_credential' ? 409 : 400;
      throw new ProblemException({
        type: 'about:blank',
        title: status === 409 ? 'No pending enrollment' : 'Invalid code',
        status,
      });
    }
    return { status: 'active', recoveryCodes: result.value.recoveryCodes };
  }

  @Post('recovery-codes')
  @HttpCode(200)
  @UseGuards(StepUpGuard)
  @ApiOperation({
    summary: 'Regenerate recovery codes',
    description:
      'Replaces the recovery-code batch and returns the new codes once. Requires a stepped-up ' +
      '(AAL2) session.',
  })
  async regenerate(@AuthToken() token: AuthTokenClaims): Promise<{ recoveryCodes: string[] }> {
    const result = await this.regenerateHandler.execute({ userId: UserId.fromString(token.sub) });
    if (!result.ok) {
      throw new ProblemException({
        type: 'about:blank',
        title: 'MFA is not enabled',
        status: 409,
      });
    }
    return { recoveryCodes: result.value.recoveryCodes };
  }

  @Post('disable')
  @HttpCode(200)
  @UseGuards(StepUpGuard)
  @ApiOperation({
    summary: 'Disable the active MFA factor',
    description: 'Requires a stepped-up (AAL2) session — the second factor must be proven first.',
  })
  async disable(@AuthToken() token: AuthTokenClaims): Promise<{ status: string }> {
    const result = await this.disableHandler.execute({ userId: UserId.fromString(token.sub) });
    if (!result.ok) {
      throw new ProblemException({
        type: 'about:blank',
        title: 'MFA is not enabled',
        status: 409,
      });
    }
    return { status: 'disabled' };
  }
}
