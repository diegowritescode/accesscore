import { type ExecutionContext } from '@nestjs/common';
import { ProblemException } from '../../shared/http/problem-details';
import { StepUpGuard } from './step-up.guard';

const contextWith = (aal: number | undefined): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => (aal === undefined ? {} : { authToken: { aal } }),
    }),
  }) as unknown as ExecutionContext;

describe('StepUpGuard', () => {
  const guard = new StepUpGuard();

  it('allows a stepped-up (AAL2+) session', () => {
    expect(guard.canActivate(contextWith(2))).toBe(true);
    expect(guard.canActivate(contextWith(3))).toBe(true);
  });

  it('rejects an AAL1 session with a 403 step_up_required problem', () => {
    for (const aal of [0, 1, undefined]) {
      try {
        guard.canActivate(contextWith(aal));
        throw new Error('expected a rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(ProblemException);
        expect((error as ProblemException).getStatus()).toBe(403);
      }
    }
  });
});
