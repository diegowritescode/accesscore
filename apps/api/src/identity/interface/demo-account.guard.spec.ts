import { type ExecutionContext } from '@nestjs/common';
import { ProblemException } from '../../shared/http/problem-details';
import { type DemoAccountPolicy } from '../application/demo-account';
import { DemoAccountGuard } from './demo-account.guard';

const contextWith = (sub: string | undefined): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => (sub === undefined ? {} : { authToken: { sub } }),
    }),
  }) as unknown as ExecutionContext;

const policyFor = (demoId: string): DemoAccountPolicy =>
  ({ isDemoAccount: (id: string) => Promise.resolve(id === demoId) }) as DemoAccountPolicy;

describe('DemoAccountGuard', () => {
  const guard = new DemoAccountGuard(policyFor('demo-user'));

  it('lets a regular account through', async () => {
    await expect(guard.canActivate(contextWith('someone-else'))).resolves.toBe(true);
  });

  it('lets an unauthenticated request through for the access-token guard to reject', async () => {
    await expect(guard.canActivate(contextWith(undefined))).resolves.toBe(true);
  });

  it('rejects the demo account with a 403 demo_account_restricted problem', async () => {
    const rejection = guard.canActivate(contextWith('demo-user'));
    await expect(rejection).rejects.toBeInstanceOf(ProblemException);
    await expect(rejection).rejects.toMatchObject({ status: 403 });
  });
});
