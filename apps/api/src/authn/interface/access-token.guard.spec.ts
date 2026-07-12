import { type ExecutionContext } from '@nestjs/common';
import { type RevocationStore } from '../domain/ports/revocation-store';
import { type VerifiedClaims, type VerifyError } from '../infrastructure/tokens/jwt-verifier';
import { type JwtVerifier } from '../infrastructure/tokens/jwt-verifier';
import { err, ok, type Result } from '../../shared/result';
import { ProblemException } from '../../shared/http/problem-details';
import { AccessTokenGuard, type AuthenticatedRequest } from './access-token.guard';

const rejectionStatus = async (promise: Promise<unknown>): Promise<number> => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ProblemException);
  return (error as ProblemException).getStatus();
};

const claims: VerifiedClaims = {
  sub: 'user-1',
  sid: 'session-1',
  org: 'org-1',
  jti: 'jti-1',
  aal: 1,
  exp: 4102444800,
};

const contextFor = (
  headers: Record<string, string>,
): { ctx: ExecutionContext; req: AuthenticatedRequest } => {
  const req = { headers } as unknown as AuthenticatedRequest;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
};

const guardWith = (
  verifyResult: Result<VerifiedClaims, VerifyError>,
  revoked: boolean,
): AccessTokenGuard => {
  const verifier = { verify: () => Promise.resolve(verifyResult) } as unknown as JwtVerifier;
  const revocation: RevocationStore = {
    revoke: () => Promise.resolve(),
    isRevoked: () => Promise.resolve(revoked),
  };
  return new AccessTokenGuard(verifier, revocation);
};

describe('AccessTokenGuard', () => {
  it('allows a valid, non-revoked token and attaches the claims', async () => {
    const guard = guardWith(ok(claims), false);
    const { ctx, req } = contextFor({ authorization: 'Bearer good.token' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.authToken).toEqual({
      sub: 'user-1',
      sid: 'session-1',
      org: 'org-1',
      jti: 'jti-1',
      aal: 1,
      exp: 4102444800,
    });
  });

  it('rejects a request without a Bearer header', async () => {
    const guard = guardWith(ok(claims), false);
    const { ctx } = contextFor({});

    expect(await rejectionStatus(guard.canActivate(ctx))).toBe(401);
  });

  it('rejects a token that fails verification', async () => {
    const guard = guardWith(err('bad_signature'), false);
    const { ctx } = contextFor({ authorization: 'Bearer bad.token' });

    expect(await rejectionStatus(guard.canActivate(ctx))).toBe(401);
  });

  it('rejects a token whose sid is blocklisted', async () => {
    const guard = guardWith(ok(claims), true);
    const { ctx } = contextFor({ authorization: 'Bearer revoked.token' });

    expect(await rejectionStatus(guard.canActivate(ctx))).toBe(401);
  });
});
