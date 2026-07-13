import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProblemException } from '../../shared/http/problem-details';
import { openApiSchema } from '../../shared/http/openapi-schema';
import { REGISTER_USER_HANDLER, type RegisterUserHandler } from '../application/register-user';
import {
  REQUEST_PASSWORD_RESET_HANDLER,
  type RequestPasswordResetHandler,
} from '../application/request-password-reset';
import { RESET_PASSWORD_HANDLER, type ResetPasswordHandler } from '../application/reset-password';
import { VERIFY_EMAIL_HANDLER, type VerifyEmailHandler } from '../application/verify-email';
import { forgotPasswordSchema, resetPasswordSchema } from './password-reset.dto';
import { registerSchema } from './register.dto';
import { verifyEmailSchema } from './verify-email.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(REGISTER_USER_HANDLER) private readonly registerUser: RegisterUserHandler,
    @Inject(VERIFY_EMAIL_HANDLER) private readonly verifyEmailHandler: VerifyEmailHandler,
    @Inject(REQUEST_PASSWORD_RESET_HANDLER)
    private readonly requestPasswordReset: RequestPasswordResetHandler,
    @Inject(RESET_PASSWORD_HANDLER) private readonly resetPassword: ResetPasswordHandler,
  ) {}

  @Post('register')
  @HttpCode(202)
  @ApiOperation({ summary: 'Register a new account (anti-enumeration; always 202)' })
  @ApiBody({ schema: openApiSchema(registerSchema) })
  async register(@Body() body: unknown): Promise<{ status: string }> {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new ProblemException({
        type: 'about:blank',
        title: 'Invalid registration request',
        status: 422,
      });
    }

    const result = await this.registerUser.execute(parsed.data);
    if (!result.ok) {
      throw new ProblemException({
        type: 'about:blank',
        title: 'Invalid registration request',
        status: 422,
        detail: result.error,
      });
    }

    return { status: 'accepted' };
  }

  @Post('verify-email')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify an email with a single-use token' })
  @ApiBody({ schema: openApiSchema(verifyEmailSchema) })
  async verifyEmail(@Body() body: unknown): Promise<{ status: string }> {
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) {
      throw new ProblemException({
        type: 'about:blank',
        title: 'Invalid or expired verification token',
        status: 400,
      });
    }

    const result = await this.verifyEmailHandler.execute(parsed.data);
    if (!result.ok) {
      throw new ProblemException({
        type: 'about:blank',
        title: 'Invalid or expired verification token',
        status: 400,
      });
    }

    return { status: 'verified' };
  }

  @Post('forgot-password')
  @HttpCode(202)
  @ApiOperation({ summary: 'Request a password reset (anti-enumeration; always 202)' })
  @ApiBody({ schema: openApiSchema(forgotPasswordSchema) })
  async forgotPassword(@Body() body: unknown): Promise<{ status: string }> {
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new ProblemException({
        type: 'about:blank',
        title: 'Invalid request',
        status: 422,
      });
    }

    await this.requestPasswordReset.execute(parsed.data);
    return { status: 'accepted' };
  }

  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset a password with a single-use token' })
  @ApiBody({ schema: openApiSchema(resetPasswordSchema) })
  async resetPasswordEndpoint(@Body() body: unknown): Promise<{ status: string }> {
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new ProblemException({
        type: 'about:blank',
        title: 'Invalid reset request',
        status: 422,
      });
    }

    const result = await this.resetPassword.execute(parsed.data);
    if (!result.ok) {
      const status = result.error === 'invalid_password' ? 422 : 400;
      throw new ProblemException({
        type: 'about:blank',
        title: status === 422 ? 'Invalid password' : 'Invalid or expired reset token',
        status,
      });
    }

    return { status: 'reset' };
  }
}
