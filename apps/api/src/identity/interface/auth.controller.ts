import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ProblemException } from '../../shared/http/problem-details';
import { REGISTER_USER_HANDLER, type RegisterUserHandler } from '../application/register-user';
import { VERIFY_EMAIL_HANDLER, type VerifyEmailHandler } from '../application/verify-email';
import { registerSchema } from './register.dto';
import { verifyEmailSchema } from './verify-email.dto';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(REGISTER_USER_HANDLER) private readonly registerUser: RegisterUserHandler,
    @Inject(VERIFY_EMAIL_HANDLER) private readonly verifyEmailHandler: VerifyEmailHandler,
  ) {}

  @Post('register')
  @HttpCode(202)
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
}
