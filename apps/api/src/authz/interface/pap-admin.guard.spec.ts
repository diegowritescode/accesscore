import { type ExecutionContext, type HttpException } from '@nestjs/common';
import { type MembershipRole } from '../../tenancy/domain/membership';
import { type OrgRoleReader } from '../../tenancy/domain/ports/org-role-reader';
import { PapAdminGuard } from './pap-admin.guard';

const contextFor = (request: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

const readerReturning = (role: MembershipRole | null): OrgRoleReader => ({
  roleOf: () => Promise.resolve(role),
});

const withOrg = { authToken: { sub: 'u1', sid: 's1', org: 'o1', jti: 'j', aal: 1, exp: 0 } };
const withoutOrg = { authToken: { sub: 'u1', sid: 's1', org: null, jti: 'j', aal: 1, exp: 0 } };

const statusOf = async (activation: Promise<boolean>): Promise<number> => {
  try {
    await activation;
    return 200;
  } catch (error) {
    return (error as HttpException).getStatus();
  }
};

describe('PapAdminGuard', () => {
  it('admits an active owner of the token org', async () => {
    const guard = new PapAdminGuard(readerReturning('owner'));
    await expect(guard.canActivate(contextFor(withOrg))).resolves.toBe(true);
  });

  it('forbids (403) a non-owner member', async () => {
    const guard = new PapAdminGuard(readerReturning('member'));
    expect(await statusOf(guard.canActivate(contextFor(withOrg)))).toBe(403);
  });

  it('forbids (403) a caller with no membership in the org', async () => {
    const guard = new PapAdminGuard(readerReturning(null));
    expect(await statusOf(guard.canActivate(contextFor(withOrg)))).toBe(403);
  });

  it('forbids (403) a token with no active org', async () => {
    const guard = new PapAdminGuard(readerReturning('owner'));
    expect(await statusOf(guard.canActivate(contextFor(withoutOrg)))).toBe(403);
  });
});
