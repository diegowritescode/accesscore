import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Ip,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserId } from '../../shared/kernel/user-id';
import { ProblemException } from '../../shared/http/problem-details';
import { openApiSchema } from '../../shared/http/openapi-schema';
import {
  LIST_SESSIONS_HANDLER,
  type ListSessionsHandler,
  type SessionView,
} from '../application/list-sessions';
import { LOGIN_HANDLER, type LoginHandler } from '../application/login';
import { REFRESH_HANDLER, type RefreshHandler } from '../application/refresh';
import { REVOKE_SESSION_HANDLER, type RevokeSessionHandler } from '../application/revoke-session';
import { SESSION_TERMINATOR, type SessionTerminator } from '../application/session-terminator';
import { STEP_UP_HANDLER, type StepUpHandler } from '../application/step-up';
import { AccessTokenGuard, type AuthTokenClaims } from './access-token.guard';
import { AuthToken } from './auth-token.decorator';
import { loginSchema } from './login.dto';
import { refreshSchema } from './refresh.dto';
import { stepUpSchema } from './step-up.dto';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  mfa_required?: boolean;
}

const invalidCredentials = (): ProblemException =>
  new ProblemException({ type: 'about:blank', title: 'Invalid credentials', status: 401 });

const invalidGrant = (): ProblemException =>
  new ProblemException({ type: 'about:blank', title: 'Invalid refresh token', status: 401 });

@ApiTags('auth')
@Controller('auth')
export class AuthnController {
  constructor(
    @Inject(LOGIN_HANDLER) private readonly login: LoginHandler,
    @Inject(REFRESH_HANDLER) private readonly refresh: RefreshHandler,
    @Inject(SESSION_TERMINATOR) private readonly sessions: SessionTerminator,
    @Inject(LIST_SESSIONS_HANDLER) private readonly listSessions: ListSessionsHandler,
    @Inject(REVOKE_SESSION_HANDLER) private readonly revokeSession: RevokeSessionHandler,
    @Inject(STEP_UP_HANDLER) private readonly stepUp: StepUpHandler,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Log in for an access + refresh token pair' })
  @ApiBody({ schema: openApiSchema(loginSchema) })
  async loginEndpoint(
    @Body() body: unknown,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ip: string,
  ): Promise<TokenResponse> {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw invalidCredentials();
    }

    const result = await this.login.execute({
      email: parsed.data.email,
      password: parsed.data.password,
      userAgent: userAgent ?? null,
      ip: ip || null,
    });
    if (!result.ok) {
      throw invalidCredentials();
    }

    return { ...this.toResponse(result.value), mfa_required: result.value.mfaRequired };
  }

  @Post('mfa/step-up')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Elevate the current session to AAL2 with a second factor' })
  @ApiBody({ schema: openApiSchema(stepUpSchema) })
  async stepUpEndpoint(
    @AuthToken() token: AuthTokenClaims,
    @Body() body: unknown,
  ): Promise<{ access_token: string; token_type: string; expires_in: number }> {
    const parsed = stepUpSchema.safeParse(body);
    if (!parsed.success) {
      throw new ProblemException({
        type: 'about:blank',
        title: 'Invalid step-up request',
        status: 422,
      });
    }
    const kind: 'totp' | 'recovery' = /^\d{6}$/.test(parsed.data.code) ? 'totp' : 'recovery';
    const result = await this.stepUp.execute({
      sessionId: token.sid,
      userId: token.sub,
      proof: { kind, value: parsed.data.code },
    });
    if (!result.ok) {
      throw new ProblemException({ type: 'about:blank', title: 'Step-up failed', status: 401 });
    }
    return {
      access_token: result.value.accessToken,
      token_type: result.value.tokenType,
      expires_in: result.value.expiresIn,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Rotate a refresh token (reuse detection revokes the family)' })
  @ApiBody({ schema: openApiSchema(refreshSchema) })
  async refreshEndpoint(@Body() body: unknown): Promise<TokenResponse> {
    const parsed = refreshSchema.safeParse(body);
    if (!parsed.success) {
      throw invalidGrant();
    }

    const result = await this.refresh.execute({ refreshToken: parsed.data.refresh_token });
    if (!result.ok) {
      throw invalidGrant();
    }

    return this.toResponse(result.value);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Log out the current session' })
  async logout(@AuthToken() token: AuthTokenClaims): Promise<void> {
    await this.sessions.terminateSession(token.sid);
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Log out every session for the user' })
  async logoutAll(@AuthToken() token: AuthTokenClaims): Promise<void> {
    await this.sessions.terminateAllForUser(UserId.fromString(token.sub));
  }

  @Get('sessions')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List the active sessions/devices for the user' })
  async listUserSessions(
    @AuthToken() token: AuthTokenClaims,
  ): Promise<{ sessions: SessionView[] }> {
    return { sessions: await this.listSessions.execute(token.sub, token.sid) };
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke one of the caller own sessions' })
  async revokeUserSession(
    @AuthToken() token: AuthTokenClaims,
    @Param('id') id: string,
  ): Promise<void> {
    const result = await this.revokeSession.execute({ callerUserId: token.sub, sessionId: id });
    if (!result.ok) {
      throw new ProblemException({ type: 'about:blank', title: 'Session not found', status: 404 });
    }
  }

  private toResponse(pair: {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresIn: number;
  }): TokenResponse {
    return {
      access_token: pair.accessToken,
      refresh_token: pair.refreshToken,
      token_type: pair.tokenType,
      expires_in: pair.expiresIn,
    };
  }
}
