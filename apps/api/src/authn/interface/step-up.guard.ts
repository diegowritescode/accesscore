import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ProblemException } from '../../shared/http/problem-details';
import { type AuthenticatedRequest } from './access-token.guard';

const MIN_AAL = 2;

@Injectable()
export class StepUpGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if ((request.authToken?.aal ?? 0) < MIN_AAL) {
      throw new ProblemException({
        type: 'about:blank',
        title: 'Step-up required',
        status: 403,
        detail: 'step_up_required',
      });
    }
    return true;
  }
}
