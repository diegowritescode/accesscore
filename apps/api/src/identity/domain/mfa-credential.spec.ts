import { UserId } from '../../shared/kernel/user-id';
import { MfaCredential } from './mfa-credential';

const now = new Date('2026-07-19T00:00:00.000Z');
const userId = UserId.generate();

const enroll = (): MfaCredential =>
  MfaCredential.enroll({ id: 'cred-1', userId, secretCiphertext: 'vault:v1:xxx', now });

describe('MfaCredential', () => {
  it('enrolls in pending status with standard TOTP parameters and an event', () => {
    const credential = enroll();
    expect(credential.status).toBe('pending');
    expect(credential.algorithm).toBe('SHA1');
    expect(credential.digits).toBe(6);
    expect(credential.period).toBe(30);
    expect(credential.lastUsedStep).toBeNull();
    expect(credential.pullEvents().map((event) => event.type)).toEqual(['identity.mfa_enrolled']);
  });

  it('activates a pending credential once', () => {
    const credential = enroll();
    credential.pullEvents();
    credential.activate(now);
    expect(credential.status).toBe('active');
    expect(credential.activatedAt).toEqual(now);
    expect(credential.pullEvents().map((event) => event.type)).toEqual(['identity.mfa_activated']);
    expect(() => credential.activate(now)).toThrow();
  });

  it('advances last used step and rejects replay', () => {
    const credential = enroll();
    credential.activate(now);
    credential.registerUse(10);
    expect(credential.lastUsedStep).toBe(10);
    expect(() => credential.registerUse(10)).toThrow('replay');
    expect(() => credential.registerUse(9)).toThrow('replay');
    credential.registerUse(11);
    expect(credential.lastUsedStep).toBe(11);
  });

  it('cannot be used before activation', () => {
    expect(() => enroll().registerUse(1)).toThrow();
  });

  it('revokes idempotently and emits once', () => {
    const credential = enroll();
    credential.activate(now);
    credential.pullEvents();
    credential.revoke(now);
    expect(credential.status).toBe('revoked');
    expect(credential.revokedAt).toEqual(now);
    expect(credential.pullEvents().map((event) => event.type)).toEqual(['identity.mfa_revoked']);
    credential.revoke(now);
    expect(credential.pullEvents()).toEqual([]);
  });
});
