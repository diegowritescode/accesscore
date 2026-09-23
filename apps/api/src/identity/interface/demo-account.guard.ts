import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { type AuthenticatedRequest } from '../../authn/interface/access-token.guard';
import { ProblemException } from '../../shared/http/problem-details';
import { DEMO_ACCOUNT_POLICY, type DemoAccountPolicy } from '../application/demo-account';

@Injectable()
export class DemoAccountGuard implements CanActivate {
  constructor(@Inject(DEMO_ACCOUNT_POLICY) private readonly policy: DemoAccountPolicy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const subject = request.authToken?.sub;
    if (subject && (await this.policy.isDemoAccount(subject))) {
      throw new ProblemException({
        type: 'about:blank',
        title: 'Not available on the shared demo account',
        status: 403,
        detail: 'demo_account_restricted',
      });
    }
    return true;
  }
}
