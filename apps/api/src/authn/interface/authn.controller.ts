import { Body, Controller, Headers, HttpCode, Inject, Ip, Post } from '@nestjs/common';
import { ProblemException } from '../../shared/http/problem-details';
import { LOGIN_HANDLER, type LoginHandler } from '../application/login';
import { REFRESH_HANDLER, type RefreshHandler } from '../application/refresh';
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

    return {
      access_token: result.value.accessToken,
      refresh_token: result.value.refreshToken,
      token_type: result.value.tokenType,
      expires_in: result.value.expiresIn,
    };
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

    return {
      access_token: result.value.accessToken,
      refresh_token: result.value.refreshToken,
      token_type: result.value.tokenType,
      expires_in: result.value.expiresIn,
    };
  }
}
