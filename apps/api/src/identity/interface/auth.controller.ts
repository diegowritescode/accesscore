import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ProblemException } from '../../shared/http/problem-details';
import { REGISTER_USER_HANDLER, type RegisterUserHandler } from '../application/register-user';
import { registerSchema } from './register.dto';

@Controller('auth')
export class AuthController {
  constructor(@Inject(REGISTER_USER_HANDLER) private readonly registerUser: RegisterUserHandler) {}

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
}
