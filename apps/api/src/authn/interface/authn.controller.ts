import { Body, Controller, Headers, HttpCode, Inject, Ip, Post, UseGuards } from '@nestjs/common';
import { UserId } from '../../identity/domain/value-objects/user-id';
import { ProblemException } from '../../shared/http/problem-details';
import { LOGIN_HANDLER, type LoginHandler } from '../application/login';
import { REFRESH_HANDLER, type RefreshHandler } from '../application/refresh';
import { SESSION_TERMINATOR, type SessionTerminator } from '../application/session-terminator';
import { AccessTokenGuard, type AuthTokenClaims } from './access-token.guard';
import { AuthToken } from './auth-token.decorator';
import { loginSchema } from './login.dto';
import { refreshSchema } from './refresh.dto';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

const invalidCredentials = (): ProblemException =>
  new ProblemException({ type: 'about:blank', title: 'Invalid credentials', status: 401 });

const invalidGrant = (): ProblemException =>
  new ProblemException({ type: 'about:blank', title: 'Invalid refresh token', status: 401 });

@Controller('auth')
export class AuthnController {
  constructor(
    @Inject(LOGIN_HANDLER) private readonly login: LoginHandler,
    @Inject(REFRESH_HANDLER) private readonly refresh: RefreshHandler,
    @Inject(SESSION_TERMINATOR) private readonly sessions: SessionTerminator,
  ) {}

  @Post('login')
  @HttpCode(200)
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

    return this.toResponse(result.value);
  }

  @Post('refresh')
  @HttpCode(200)
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
  async logout(@AuthToken() token: AuthTokenClaims): Promise<void> {
    await this.sessions.terminateSession(token.sid, token.exp);
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  async logoutAll(@AuthToken() token: AuthTokenClaims): Promise<void> {
    await this.sessions.terminateAllForUser(UserId.fromString(token.sub));
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
