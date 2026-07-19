import { UserId } from '../../shared/kernel/user-id';
import { type Clock } from '../../shared/kernel/clock';
import {
  type AccessTokenClaims,
  type AccessTokenIssuer,
} from '../domain/ports/access-token-issuer';
import { type AuditEvent } from '../../security/domain/audit-event';
import { type AuditLog } from '../../security/domain/ports/audit-log';
import { type LockoutStore } from '../domain/ports/lockout-store';
import { type SecondFactor } from '../domain/ports/second-factor';
import { type SessionsRepository } from '../domain/ports/sessions-repository';
import { type Session } from '../domain/session';
import { SessionId } from '../domain/value-objects/session-id';
import { StepUpHandler } from './step-up';

const now = new Date('2026-07-19T00:00:00.000Z');
const clock: Clock = { now: () => now };
const SID = '22222222-2222-2222-2222-222222222222';
const UID = '11111111-1111-1111-1111-111111111111';

const session = (overrides: Partial<Session> = {}): Session => ({
  id: SessionId.fromString(SID),
  userId: UserId.fromString(UID),
  orgId: null,
  aal: 1,
  authTime: now,
  status: 'active',
  deviceLabel: null,
  userAgent: null,
  ip: null,
  createdAt: now,
  lastSeenAt: now,
  expiresAt: new Date(now.getTime() + 1000),
  revokedAt: null,
  ...overrides,
});

class FakeSessions implements SessionsRepository {
  elevations: { id: string; aal: number }[] = [];
  constructor(private readonly found: Session | null) {}
  create(): Promise<void> {
    return Promise.resolve();
  }
  findById(): Promise<Session | null> {
    return Promise.resolve(this.found);
  }
  listActiveByUser(): Promise<Session[]> {
    return Promise.resolve([]);
  }
  touch(): Promise<void> {
    return Promise.resolve();
  }
  elevate(id: SessionId, aal: number): Promise<boolean> {
    this.elevations.push({ id: id.value, aal });
    return Promise.resolve(true);
  }
  revoke(): Promise<void> {
    return Promise.resolve();
  }
  revokeAllForUser(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

const secondFactor = (result: boolean): SecondFactor => ({ verify: () => Promise.resolve(result) });

const POLICY = { threshold: 5, windowSeconds: 900 };

interface RecordingAudit extends AuditLog {
  events: AuditEvent[];
}

const recordingAudit = (): RecordingAudit => {
  const events: AuditEvent[] = [];
  return {
    events,
    append: (event) => {
      events.push(event);
      return Promise.resolve({ seq: events.length, hash: 'h' });
    },
    verify: () => Promise.resolve({ ok: true, length: events.length, brokenAt: null }),
  };
};

interface RecordingLockout extends LockoutStore {
  failures: string[];
  resets: string[];
  lockedKeys: Set<string>;
}

const recordingLockout = (): RecordingLockout => {
  const failures: string[] = [];
  const resets: string[] = [];
  const lockedKeys = new Set<string>();
  return {
    failures,
    resets,
    lockedKeys,
    isLocked: (key) => Promise.resolve(lockedKeys.has(key)),
    registerFailure: (key) => {
      failures.push(key);
      return Promise.resolve({ locked: false, retriesLeft: 5 });
    },
    reset: (key) => {
      resets.push(key);
      return Promise.resolve();
    },
  };
};

const issuer = (): { issuer: AccessTokenIssuer; claims: AccessTokenClaims[] } => {
  const claims: AccessTokenClaims[] = [];
  return {
    claims,
    issuer: {
      issue: (input) => {
        claims.push(input);
        return Promise.resolve({
          token: 'reissued',
          jti: 'jti',
          expiresAt: new Date(now.getTime() + 900_000),
          expiresInSeconds: 900,
        });
      },
    },
  };
};

describe('StepUpHandler', () => {
  it('elevates the session and reissues an AAL2 token on a valid factor', async () => {
    const sessions = new FakeSessions(session());
    const tokens = issuer();
    const lockout = recordingLockout();
    const audit = recordingAudit();
    const handler = new StepUpHandler(
      sessions,
      secondFactor(true),
      tokens.issuer,
      lockout,
      clock,
      POLICY,
      audit,
    );

    const result = await handler.execute({
      sessionId: SID,
      userId: UID,
      proof: { kind: 'totp', value: '123456' },
    });

    expect(result).toEqual({
      ok: true,
      value: { accessToken: 'reissued', tokenType: 'Bearer', expiresIn: 900 },
    });
    expect(sessions.elevations).toEqual([{ id: SID, aal: 2 }]);
    expect(tokens.claims[0]?.aal).toBe(2);
    expect(lockout.resets).toEqual([`mfa:${UID}`]);
    expect(audit.events.map((event) => event.type)).toEqual(['mfa.step_up']);
  });

  it('rejects an invalid factor without elevating and registers a failure', async () => {
    const sessions = new FakeSessions(session());
    const lockout = recordingLockout();
    const audit = recordingAudit();
    const handler = new StepUpHandler(
      sessions,
      secondFactor(false),
      issuer().issuer,
      lockout,
      clock,
      POLICY,
      audit,
    );

    expect(
      await handler.execute({
        sessionId: SID,
        userId: UID,
        proof: { kind: 'totp', value: '000000' },
      }),
    ).toEqual({
      ok: false,
      error: 'invalid_factor',
    });
    expect(sessions.elevations).toEqual([]);
    expect(lockout.failures).toEqual([`mfa:${UID}`]);
    expect(audit.events.map((event) => event.type)).toEqual(['mfa.step_up_failed']);
  });

  it('rejects step-up when the mfa lockout is engaged, without verifying', async () => {
    const lockout = recordingLockout();
    lockout.lockedKeys.add(`mfa:${UID}`);
    const sessions = new FakeSessions(session());
    const handler = new StepUpHandler(
      sessions,
      secondFactor(true),
      issuer().issuer,
      lockout,
      clock,
      POLICY,
      recordingAudit(),
    );

    expect(
      await handler.execute({
        sessionId: SID,
        userId: UID,
        proof: { kind: 'totp', value: '123456' },
      }),
    ).toEqual({ ok: false, error: 'locked' });
    expect(sessions.elevations).toEqual([]);
  });

  it('rejects an unknown, revoked, or mismatched session', async () => {
    const handler = (found: Session | null): StepUpHandler =>
      new StepUpHandler(
        new FakeSessions(found),
        secondFactor(true),
        issuer().issuer,
        recordingLockout(),
        clock,
        POLICY,
        recordingAudit(),
      );

    const proof = { kind: 'totp' as const, value: '123456' };
    expect(await handler(null).execute({ sessionId: SID, userId: UID, proof })).toEqual({
      ok: false,
      error: 'invalid_session',
    });
    expect(
      await handler(session({ status: 'revoked' })).execute({ sessionId: SID, userId: UID, proof }),
    ).toEqual({ ok: false, error: 'invalid_session' });
    expect(
      await handler(session()).execute({ sessionId: SID, userId: 'other-user', proof }),
    ).toEqual({ ok: false, error: 'invalid_session' });
  });
});
