import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { type AuthenticatedRequest } from '../../authn/interface/access-token.guard';
import { ProblemException } from '../../shared/http/problem-details';
import { OrgId } from '../../shared/kernel/org-id';
import { UserId } from '../../shared/kernel/user-id';
import { ORG_ROLE_READER, type OrgRoleReader } from '../../tenancy/domain/ports/org-role-reader';

const forbidden = (): ProblemException =>
  new ProblemException({ type: 'about:blank', title: 'Forbidden', status: 403 });

@Injectable()
export class PapAdminGuard implements CanActivate {
  constructor(@Inject(ORG_ROLE_READER) private readonly roles: OrgRoleReader) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const token = context.switchToHttp().getRequest<AuthenticatedRequest>().authToken;
    if (!token?.org) {
      throw forbidden();
    }
    const role = await this.roles.roleOf(UserId.fromString(token.sub), OrgId.fromString(token.org));
    if (role !== 'owner') {
      throw forbidden();
    }
    return true;
  }
}
