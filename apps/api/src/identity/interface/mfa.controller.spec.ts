import { randomUUID } from 'node:crypto';
import { type AuthTokenClaims } from '../../authn/interface/access-token.guard';
import { ProblemException } from '../../shared/http/problem-details';
import { type ActivateMfaHandler } from '../application/activate-mfa';
import { type DisableMfaHandler } from '../application/disable-mfa';
import { type EnrollMfaHandler } from '../application/enroll-mfa';
import { type GetMfaStatusHandler } from '../application/get-mfa-status';
import { type RegenerateRecoveryCodesHandler } from '../application/regenerate-recovery-codes';
import { MfaController } from './mfa.controller';

const token: AuthTokenClaims = {
  sub: randomUUID(),
  sid: 'sid-1',
  org: 'org-1',
  jti: 'jti-1',
  aal: 1,
  exp: 0,
};

interface Handlers {
  enroll?: EnrollMfaHandler['execute'];
  activate?: ActivateMfaHandler['execute'];
  disable?: DisableMfaHandler['execute'];
  status?: GetMfaStatusHandler['execute'];
  regenerate?: RegenerateRecoveryCodesHandler['execute'];
}

const controllerWith = (handlers: Handlers): MfaController =>
  new MfaController(
    { execute: handlers.enroll } as EnrollMfaHandler,
    { execute: handlers.activate } as ActivateMfaHandler,
    { execute: handlers.disable } as DisableMfaHandler,
    { execute: handlers.status } as GetMfaStatusHandler,
    { execute: handlers.regenerate } as RegenerateRecoveryCodesHandler,
  );

describe('MfaController', () => {
  it('reports MFA status', async () => {
    const controller = controllerWith({
      status: () => Promise.resolve({ enabled: true, recoveryCodesRemaining: 5 }),
    });
    expect(await controller.status(token)).toEqual({ enabled: true, recoveryCodesRemaining: 5 });
  });

  it('returns the otpauth URI on enrollment', async () => {
    const controller = controllerWith({
      enroll: () => Promise.resolve({ ok: true, value: { otpauthUri: 'otpauth://totp/x' } }),
    });
    expect(await controller.enroll(token)).toEqual({ otpauthUri: 'otpauth://totp/x' });
  });

  it('maps a missing user on enrollment to a problem', async () => {
    const controller = controllerWith({
      enroll: () => Promise.resolve({ ok: false, error: 'user_not_found' }),
    });
    await expect(controller.enroll(token)).rejects.toBeInstanceOf(ProblemException);
  });

  it('rejects a malformed activation code with a problem', async () => {
    const controller = controllerWith({
      activate: () => Promise.resolve({ ok: true, value: { recoveryCodes: [] } }),
    });
    await expect(controller.activate(token, { code: 'abc' })).rejects.toBeInstanceOf(
      ProblemException,
    );
  });

  it('activates with a valid code and returns recovery codes', async () => {
    const controller = controllerWith({
      activate: () => Promise.resolve({ ok: true, value: { recoveryCodes: ['A-B', 'C-D'] } }),
    });
    expect(await controller.activate(token, { code: '123456' })).toEqual({
      status: 'active',
      recoveryCodes: ['A-B', 'C-D'],
    });
  });

  it('maps activation errors to problems', async () => {
    const noPending = controllerWith({
      activate: () => Promise.resolve({ ok: false, error: 'no_pending_credential' }),
    });
    await expect(noPending.activate(token, { code: '123456' })).rejects.toBeInstanceOf(
      ProblemException,
    );
    const invalid = controllerWith({
      activate: () => Promise.resolve({ ok: false, error: 'invalid_code' }),
    });
    await expect(invalid.activate(token, { code: '123456' })).rejects.toBeInstanceOf(
      ProblemException,
    );
  });

  it('regenerates recovery codes and maps not-enabled to a problem', async () => {
    const ok = controllerWith({
      regenerate: () => Promise.resolve({ ok: true, value: { recoveryCodes: ['X-Y'] } }),
    });
    expect(await ok.regenerate(token)).toEqual({ recoveryCodes: ['X-Y'] });

    const notEnabled = controllerWith({
      regenerate: () => Promise.resolve({ ok: false, error: 'not_enabled' }),
    });
    await expect(notEnabled.regenerate(token)).rejects.toBeInstanceOf(ProblemException);
  });

  it('disables MFA and maps not-enabled to a problem', async () => {
    const ok = controllerWith({ disable: () => Promise.resolve({ ok: true, value: undefined }) });
    expect(await ok.disable(token)).toEqual({ status: 'disabled' });

    const notEnabled = controllerWith({
      disable: () => Promise.resolve({ ok: false, error: 'not_enabled' }),
    });
    await expect(notEnabled.disable(token)).rejects.toBeInstanceOf(ProblemException);
  });
});
