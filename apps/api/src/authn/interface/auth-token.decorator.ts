import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type AuthTokenClaims, type AuthenticatedRequest } from './access-token.guard';

export const AuthToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthTokenClaims => {
    return context.switchToHttp().getRequest<AuthenticatedRequest>().authToken;
  },
);
