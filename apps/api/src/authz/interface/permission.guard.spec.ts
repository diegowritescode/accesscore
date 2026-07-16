import { type ExecutionContext } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { ProblemException } from '../../shared/http/problem-details';
import { type Clock } from '../../shared/kernel/clock';
import { type Decision } from '../domain/decision';
import { type PolicyDecisionPoint } from '../domain/policy-decision-point';
import { PermissionGuard } from './permission.guard';
import { type RequiredPermission } from './require-permission.metadata';

const handler = (): void => undefined;

const contextFor = (request: unknown): ExecutionContext =>
  ({
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const reflectorReturning = (value: RequiredPermission | undefined): Reflector =>
  ({ get: () => value }) as unknown as Reflector;

const pdpReturning = (decision: Decision): PolicyDecisionPoint => ({
  check: () => Promise.resolve(decision),
  batchCheck: () => Promise.resolve([]),
  expand: () => Promise.resolve([]),
  simulate: () => Promise.resolve({ decision, live: decision, changed: false }),
});

const failingPdp: PolicyDecisionPoint = {
  check: () => Promise.reject(new Error('pdp unavailable')),
  batchCheck: () => Promise.reject(new Error('pdp unavailable')),
  expand: () => Promise.reject(new Error('pdp unavailable')),
  simulate: () => Promise.reject(new Error('pdp unavailable')),
};

const clock: Clock = { now: () => new Date(0) };

const permit: Decision = { effect: 'permit', reasons: [] };
const denied: Decision = { effect: 'deny', reasons: [{ code: 'default_deny', message: 'no' }] };

const required: RequiredPermission = {
  action: 'document.read',
  resource: () => ({ type: 'document', id: 'doc-1' }),
};

const authedRequest = {
  authToken: { sub: 'user-1', sid: 'sid-1', org: 'org-1', jti: 'jti-1', aal: 1, exp: 0 },
  params: { id: 'doc-1' },
  ip: '127.0.0.1',
};

describe('PermissionGuard', () => {
  it('allows the request when no permission metadata is present', async () => {
    const guard = new PermissionGuard(reflectorReturning(undefined), pdpReturning(permit), clock);
    await expect(guard.canActivate(contextFor(authedRequest))).resolves.toBe(true);
  });

  it('allows a caller the PDP permits', async () => {
    const guard = new PermissionGuard(reflectorReturning(required), pdpReturning(permit), clock);
    await expect(guard.canActivate(contextFor(authedRequest))).resolves.toBe(true);
  });

  it('forbids a caller the PDP does not permit', async () => {
    const guard = new PermissionGuard(reflectorReturning(required), pdpReturning(denied), clock);
    await expect(guard.canActivate(contextFor(authedRequest))).rejects.toBeInstanceOf(
      ProblemException,
    );
  });

  it('fails closed when the PDP errors', async () => {
    const guard = new PermissionGuard(reflectorReturning(required), failingPdp, clock);
    await expect(guard.canActivate(contextFor(authedRequest))).rejects.toBeInstanceOf(
      ProblemException,
    );
  });

  it('forbids an unauthenticated request', async () => {
    const guard = new PermissionGuard(reflectorReturning(required), pdpReturning(permit), clock);
    await expect(guard.canActivate(contextFor({ params: { id: 'doc-1' } }))).rejects.toBeInstanceOf(
      ProblemException,
    );
  });

  it('forbids a malformed required action', async () => {
    const guard = new PermissionGuard(
      reflectorReturning({ action: 'not-an-action', resource: () => ({ type: 'd', id: '1' }) }),
      pdpReturning(permit),
      clock,
    );
    await expect(guard.canActivate(contextFor(authedRequest))).rejects.toBeInstanceOf(
      ProblemException,
    );
  });
});
