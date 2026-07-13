import { type Decision } from '@accesscore/contracts';
import { type ExecutionContext, type HttpException } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { type AccessCoreClient } from './client';
import { AccessCorePermissionGuard, resourceFromParam } from './nest';

const handler = (): void => undefined;

const contextFor = (request: unknown): ExecutionContext =>
  ({
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const reflectorReturning = (value: unknown): Reflector =>
  ({ get: () => value }) as unknown as Reflector;

const clientReturning = (decision: Decision): AccessCoreClient => ({
  check: () => Promise.resolve(decision),
});

const required = { action: 'document.read', resource: resourceFromParam('document', 'id') };
const request = { headers: { authorization: 'Bearer tok' }, params: { id: 'doc-1' } };

const permit: Decision = { effect: 'permit', reasons: [] };
const denyWith = (code: string): Decision => ({
  effect: 'deny',
  reasons: [{ code, message: 'x' }],
});

const statusOf = async (activation: Promise<boolean>): Promise<number> => {
  try {
    await activation;
    return 200;
  } catch (error) {
    return (error as HttpException).getStatus();
  }
};

describe('AccessCorePermissionGuard', () => {
  it('allows the request when no permission metadata is present', async () => {
    const guard = new AccessCorePermissionGuard(
      reflectorReturning(undefined),
      clientReturning(permit),
    );
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it('allows a permitted caller', async () => {
    const guard = new AccessCorePermissionGuard(
      reflectorReturning(required),
      clientReturning(permit),
    );
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it('forbids (403) a plain deny', async () => {
    const guard = new AccessCorePermissionGuard(
      reflectorReturning(required),
      clientReturning(denyWith('default_deny')),
    );
    expect(await statusOf(guard.canActivate(contextFor(request)))).toBe(403);
  });

  it('returns 401 when the PDP reports the token unauthenticated', async () => {
    const guard = new AccessCorePermissionGuard(
      reflectorReturning(required),
      clientReturning(denyWith('unauthenticated')),
    );
    expect(await statusOf(guard.canActivate(contextFor(request)))).toBe(401);
  });

  it('returns 503 (retryable) when the PDP is unavailable', async () => {
    const guard = new AccessCorePermissionGuard(
      reflectorReturning(required),
      clientReturning(denyWith('pdp_unavailable')),
    );
    expect(await statusOf(guard.canActivate(contextFor(request)))).toBe(503);
  });

  it('returns 401 when the request carries no bearer token', async () => {
    const guard = new AccessCorePermissionGuard(
      reflectorReturning(required),
      clientReturning(permit),
    );
    expect(await statusOf(guard.canActivate(contextFor({ headers: {}, params: {} })))).toBe(401);
  });
});
